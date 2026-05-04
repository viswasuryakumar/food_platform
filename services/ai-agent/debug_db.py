import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def check_db():
    uri = os.getenv("MONGO_URI")
    client = MongoClient(uri)
    db = client.get_default_database()
    
    print(f"Connected to database: {db.name}")
    print(f"Collections: {db.list_collection_names()}")
    
    if "menuitems" in db.list_collection_names():
        items = list(db.menuitems.find().limit(5))
        print(f"\nFound {len(items)} items in 'menuitems':")
        for item in items:
            print(f"- {item.get('name')} (${item.get('price')})")
    else:
        print("\n'menuitems' collection NOT found!")

if __name__ == "__main__":
    check_db()
