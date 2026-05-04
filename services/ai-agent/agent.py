import asyncio
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
import time
from typing import List
from langchain_core.tools import BaseTool, StructuredTool
from contextlib import AsyncExitStack

# Load environment variables
load_dotenv()

app = FastAPI(title="AI Food Agent Service")

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables to hold the agent and client
agent_executor = None
mcp_client = None
exit_stack = AsyncExitStack()

class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default_user"

class ChatResponse(BaseModel):
    response: str

async def initialize_agent():
    global agent_executor, mcp_client
    
    print("\n[AI-AGENT] initialize_agent() called")
    
    # 1. Configuration for the MCP Servers
    mcp_servers = {
        "mongodb": {
            "command": "node",
            "args": ["node_modules/mongodb-mcp-server/dist/index.js", "--connectionString", os.getenv("MONGO_URI")],
            "transport": "stdio",
        }
    }

    # 2. Initialize the MCP Client
    print("\n--- PERFORMANCE TRACE: STARTUP ---")
    
    print("Step 1: Initializing MCP MultiServer Client...")
    start_init = time.time()
    mcp_client = MultiServerMCPClient(mcp_servers)
    print(f"MCP Client object created in: {time.time() - start_init:.4f}s")

    print("Step 2: Starting Persistent Sessions...")
    start_session = time.time()
    
    # Ensure we enter the exit stack
    # In a real app, you'd handle cleanup in a shutdown event
    # For now, we'll enter it here
    await exit_stack.__aenter__()
    
    # Start a persistent session for mongodb
    mongodb_session = await exit_stack.enter_async_context(mcp_client.session("mongodb"))
    print(f"Persistent session for 'mongodb' started in: {time.time() - start_session:.4f}s")

    print("Step 3: Loading Tools from Session...")
    start_tools = time.time()
    original_tools = await load_mcp_tools(mongodb_session)
    print(f"Tool loading took: {time.time() - start_tools:.4f}s")
    print(f"Found {len(original_tools)} tools.")

    # Wrap tools with timing instrumentation
    tools = []
    for tool in original_tools:
        def create_timed_tool(t):
            async def timed_invoke(**kwargs):
                print(f"\n--- PERFORMANCE TRACE: TOOL CALL [{t.name}] ---")
                print(f"Input: {kwargs}")
                start_tool = time.time()
                try:
                    res = await t.ainvoke(kwargs)
                    return res
                finally:
                    print(f"TOOL [{t.name}] execution took: {time.time() - start_tool:.4f}s")
                    print(f"--- END TOOL CALL ---\n")
            
            # Create a new tool that mirrors the original but with timing
            return StructuredTool.from_function(
                name=t.name,
                description=t.description,
                coroutine=timed_invoke,
                args_schema=t.args_schema
            )
        
        tools.append(create_timed_tool(tool))
    
    print("Step 4: Initializing LLM...")
    llm = ChatOpenAI(
        base_url=os.getenv("OPENAI_API_BASE"),
        api_key=os.getenv("OPENROUTER_API_KEY"),
        model=os.getenv("OPENROUTER_MODEL"),
    )

    # 4. Add Memory (Checkpointer)
    memory = MemorySaver()

    # 5. Create the Agent with the provided structured prompt
    system_prompt = (
        "You are a helpful AI assistant for a Food Delivery Platform.\n\n"
        "You have access to a MongoDB database named '280'.\n\n"
        "========================\n"
        "STRICT RULES\n"
        "========================\n"
        "1. ALWAYS use the database name '280' for all tool calls.\n"
        "2. Use:\n"
        "   - 'restaurants' collection for restaurant info\n"
        "   - 'menuitems' collection for food items\n"
        "3. ALWAYS use exact match on name_normalized:\n"
        "   {'name_normalized': query.toLowerCase().trim()}\n"
        "4. NEVER say 'not found' without checking ALL relevant collections.\n\n"
        "========================\n"
        "ORDER CONFIRMATION\n"
        "========================\n"
        "If the user confirms they want to place an order (e.g., 'yes', 'confirm', 'place order'), "
        "you MUST fetch the restaurant _id first, then include this EXACT tag in your response:\n"
        '[REDIRECT_ORDER: RESTAURANT_ID | [{"name":"Item Name","quantity":1}]]\n'
        "Replace RESTAURANT_ID with the MongoDB _id of the restaurant.\n"
        "Replace the JSON array with the actual items discussed.\n"
        'Example: [REDIRECT_ORDER: 64f1abc123 | [{"name":"Masala Dosa","quantity":1},{"name":"Filter Coffee","quantity":1}]]\n\n'
        "========================\n"
        "SEARCH STRATEGY (VERY IMPORTANT)\n"
        "========================\n\n"
        "FOOD ITEM QUERY (e.g., 'dosa', 'burger'):\n"
        "1. FIRST search 'menuitems' collection\n"
        "2. Then find corresponding restaurants using restaurantId\n"
        "3. If needed, also check restaurants.menu array\n\n"
        "RESTAURANT QUERY (e.g., 'Campus Bites'):\n"
        "1. Search 'restaurants' collection\n"
        "2. Then fetch its menu\n\n"
        "========================\n"
        "RESPONSE RULES\n"
        "========================\n\n"
        "1. When item is found: Show restaurant name, item name, and price.\n"
        "2. When restaurant is found: Show name, address, cuisine, and relevant menu items.\n"
        "3. Be concise and helpful."
    )
    
    agent_executor = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_prompt,
        checkpointer=memory
    )
    print("AI Agent is ready.")

@app.on_event("startup")
async def startup_event():
    await initialize_agent()

@app.on_event("shutdown")
async def shutdown_event():
    print("Shutting down MCP sessions...")
    await exit_stack.__aexit__(None, None, None)
    print("Shutdown complete.")

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not agent_executor:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    try:
        print("\n--- PERFORMANCE TRACE: CHAT INVOCATION ---")
        start_chat = time.time()
        
        config = {"configurable": {"thread_id": request.thread_id}}
        result = await agent_executor.ainvoke(
            {"messages": [("user", request.message)]},
            config=config
        )
        
        print(f"Total agent invocation took: {time.time() - start_chat:.4f}s")
        
        start_serial = time.time()
        final_answer = result["messages"][-1].content
        print(f"Response serialization took: {time.time() - start_serial:.4f}s")
        print("--- END CHAT INVOCATION ---\n")
        
        return ChatResponse(response=final_answer)
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import StreamingResponse as FastAPIStreamingResponse
import json

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streams tokens from the LLM using Server-Sent Events (SSE)."""
    if not agent_executor:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    async def event_generator():
        print("\n--- PERFORMANCE TRACE: STREAM CHAT INVOCATION ---")
        start_chat = time.time()
        
        config = {"configurable": {"thread_id": request.thread_id}}
        try:
            # astream_events streams each token as it's generated
            async for event in agent_executor.astream_events(
                {"messages": [("user", request.message)]},
                config=config,
                version="v2"
            ):
                # We only care about LLM text chunks (not tool calls)
                kind = event.get("event")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        # Send token as an SSE data line
                        payload = json.dumps({"token": chunk.content})
                        yield f"data: {payload}\n\n"
            
            print(f"Total stream agent invocation took: {time.time() - start_chat:.4f}s")
            print("--- END STREAM CHAT INVOCATION ---\n")
            
            # Signal end of stream
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            print(f"Error in stream chat: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return FastAPIStreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
