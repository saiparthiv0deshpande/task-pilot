import os

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    value = os.getenv("ENCRYPTION_KEY")
    if not value:
        raise RuntimeError("Missing required environment variable: ENCRYPTION_KEY")
    encoded = value.encode("utf-8")
    if len(encoded) != 32:
        raise RuntimeError("ENCRYPTION_KEY must be exactly 32 UTF-8 bytes")
    return encoded


def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return ""
    nonce = os.urandom(12)
    encrypted = AESGCM(_key()).encrypt(nonce, plaintext.encode("utf-8"), None)
    return f"v2:{nonce.hex()}:{encrypted[-16:].hex()}:{encrypted[:-16].hex()}"


def decrypt_token(encrypted: str) -> str:
    if not encrypted:
        return ""
    parts = encrypted.split(":")
    if len(parts) == 4 and parts[0] == "v2":
        nonce, tag, ciphertext = bytes.fromhex(parts[1]), bytes.fromhex(parts[2]), bytes.fromhex(parts[3])
        return AESGCM(_key()).decrypt(nonce, ciphertext + tag, None).decode("utf-8")

    # Transitional decoding for records written by the former CBC format.
    if len(parts) == 2:
        iv, ciphertext = bytes.fromhex(parts[0]), bytes.fromhex(parts[1])
        decryptor = Cipher(algorithms.AES(_key()), modes.CBC(iv)).decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()
        return (unpadder.update(padded) + unpadder.finalize()).decode("utf-8")
    raise ValueError("Unsupported encrypted credential format")
