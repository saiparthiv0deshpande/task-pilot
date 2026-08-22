import asyncio
import os
import dotenv
from motor.motor_asyncio import AsyncIOMotorClient

dotenv.load_dotenv()
client = AsyncIOMotorClient(os.getenv('MONGO_URI'))
db = client['ai_assistant']

async def main():
    users = await db.users.find().to_list(None)
    for u in users:
        print(f"User: {u.get('username')}, Token: {u.get('githubAccessToken')}")

asyncio.run(main())
