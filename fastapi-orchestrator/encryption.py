import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from dotenv import load_dotenv

load_dotenv(override=True)
# Must exactly match the Express.js ENCRYPTION_KEY
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "12345678901234567890123456789012").encode('utf-8')

def decrypt_token(encrypted_str: str) -> str:
    """Decrypts the AES-256-CBC token saved by Express.js"""
    if not encrypted_str:
        return ""
    try:
        parts = encrypted_str.split(':')
        if len(parts) != 2:
            return ""
            
        iv = bytes.fromhex(parts[0])
        ciphertext = bytes.fromhex(parts[1])
        
        cipher = Cipher(algorithms.AES(ENCRYPTION_KEY), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(ciphertext) + decryptor.finalize()
        
        # PKCS7 unpadding
        padding_length = padded_data[-1]
        data = padded_data[:-padding_length]
        return data.decode('utf-8')
    except Exception as e:
        print(f"Decryption failed: {e}")
        return ""
