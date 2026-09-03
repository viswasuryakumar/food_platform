import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import ReactMarkdown from 'react-markdown';
import './Chatbot.css';

import { API_BASE } from '../api/axiosInstance';

const AI_BASE = `${API_BASE}/api/ai`;

const INITIAL_MESSAGE = { text: "Hi! I'm your **AI Food Assistant**. Ask me anything about restaurants, prices, or menu items.", sender: 'bot' };

const Chatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  // Each user gets their own thread; fall back to a generic id if somehow missing.
  const threadId = user?.id || user?._id || 'anonymous';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset conversation whenever the logged-in user changes (e.g. after logout→login)
  useEffect(() => {
    setMessages([INITIAL_MESSAGE]);
    setIsOpen(false);
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    setMessages(prev => [...prev, { text: userMessage, sender: 'user' }]);

    // Add a placeholder bot message that we'll stream into
    setMessages(prev => [...prev, { text: '', sender: 'bot', streaming: true }]);

    let fullText = '';

    try {
      const response = await fetch(`${AI_BASE}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ message: userMessage, thread_id: threadId }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Parse SSE chunks
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const parsed = JSON.parse(raw);

            if (parsed.done) {
              // Stream complete — check for redirect tag with optional items
              // Format: [REDIRECT_ORDER: RESTAURANT_ID | [{"name":"...","quantity":1}]]
              const redirectMatch = fullText.match(
                /\[REDIRECT_ORDER:\s*([a-f\d]{24})\s*(?:\|\s*(\[.*?\]))?\]/is
              );
              if (redirectMatch) {
                const restaurantId = redirectMatch[1];
                let draftItems = [];
                if (redirectMatch[2]) {
                  try {
                    draftItems = JSON.parse(redirectMatch[2]);
                  } catch {
                    draftItems = [];
                  }
                }
                const cleanText = fullText
                  .replace(/\[REDIRECT_ORDER:.*?\]/is, '')
                  .trim();
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    text: cleanText || "Great! Taking you to the order page...",
                    sender: 'bot'
                  };
                  return updated;
                });
                setTimeout(() => {
                  navigate(`/order/${restaurantId}`, {
                    state: { draftItems }
                  });
                  setIsOpen(false);
                }, 1200);
              } else {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { text: fullText, sender: 'bot' };
                  return updated;
                });
              }
            } else if (parsed.token) {
              fullText += parsed.token;
              // Update the last (streaming) message in real-time
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { text: fullText, sender: 'bot', streaming: true };
                return updated;
              });
            } else if (parsed.error) {
              fullText = "Sorry, I encountered an error. Please try again.";
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { text: fullText, sender: 'bot' };
                return updated;
              });
            }
          } catch {
            // Ignore JSON parse errors for partial chunks
          }
        }
      }
    } catch (error) {
      console.error("Streaming chat error:", error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          text: "The assistant is temporarily unavailable. You can still browse restaurants and place an order normally.",
          sender: 'bot'
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      // Remove streaming flag from last message
      setMessages(prev => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.streaming) {
          updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false };
        }
        return updated;
      });
    }
  };

  return (
    <div className="chatbot-container">
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <div className="chat-header-info">
              <span className="chat-header-avatar">🤖</span>
              <div>
                <div className="chat-header-title">AI Food Assistant</div>
                <div className="chat-header-status">
                  {isLoading ? 'Thinking...' : 'Online'}
                </div>
              </div>
            </div>
            <button className="chat-close-btn" onClick={() => setIsOpen(false)}>✕</button>
          </div>

          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message ${msg.sender}`}>
                {msg.sender === 'bot' ? (
                  <div className="bot-message-content">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                    {msg.streaming && <span className="cursor-blink">▌</span>}
                  </div>
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.text === '' && (
              <div className="message bot">
                <div className="loading-dots">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-area" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="Ask about food, prices, restaurants..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? '...' : '➤'}
            </button>
          </form>
        </div>
      )}

      <button
        className={`chatbot-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="AI Food Assistant"
      >
        {isOpen ? '✕' : '🤖'}
      </button>
    </div>
  );
};

export default Chatbot;
