#!/usr/bin/env python3
"""Create a Telethon StringSession locally. Never commit the printed session."""
import asyncio
import getpass

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError
from telethon.sessions import StringSession


async def main():
    api_id = int(input("Telegram API ID: ").strip())
    api_hash = getpass.getpass("Telegram API hash (скрыт): ").strip()
    phone = input("Номер телефона с кодом страны (например +49...): ").strip()

    client = TelegramClient(StringSession(), api_id, api_hash)
    await client.connect()
    try:
        sent = await client.send_code_request(phone)
        code = input("Код, пришедший в Telegram: ").strip().replace(" ", "")
        try:
            await client.sign_in(phone=phone, code=code, phone_code_hash=sent.phone_code_hash)
        except SessionPasswordNeededError:
            password = getpass.getpass("Пароль двухэтапной защиты (скрыт): ")
            await client.sign_in(password=password)

        print("\nTG_SESSION (скопируйте всю строку):\n")
        print(client.session.save())
        print("\nНикому не отправляйте эту строку. Добавьте её только в GitHub Actions secret TG_SESSION.")
    finally:
        await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())