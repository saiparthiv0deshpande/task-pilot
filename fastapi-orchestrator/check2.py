import asyncio
import os
import dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from encryption import decrypt_token

dotenv.load_dotenv()
client = AsyncIOMotorClient(os.getenv('MONGO_URI'))
db = client['ai_assistant']

async def main():
    users = await db.users.find().to_list(None)
    for u in users:
        token = u.get('githubAccessToken')
        decrypted = decrypt_token(token)
        print(f"Decrypted length: {len(decrypted)}, Decrypted: {decrypted}")

asyncio.run(main())
