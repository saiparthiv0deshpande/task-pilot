import asyncio
import os
import dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

dotenv.load_dotenv()
client = AsyncIOMotorClient(os.getenv('MONGO_URI'))
db = client['ai_assistant']
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "12345678901234567890123456789012").encode('utf-8')

async def main():
    users = await db.users.find().to_list(None)
    for u in users:
        token = u.get('githubAccessToken')
        parts = token.split(':')
        iv = bytes.fromhex(parts[0])
        ciphertext = bytes.fromhex(parts[1])
        
        cipher = Cipher(algorithms.AES(ENCRYPTION_KEY), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(ciphertext) + decryptor.finalize()
        print("Padded data:", padded_data)
        padding_length = padded_data[-1]
        print("Padding length:", padding_length)
        data = padded_data[:-padding_length]
        print("Data:", data)

asyncio.run(main())
