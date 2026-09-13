(function () {
  let client = null;

  async function connect({ apiId, apiHash, session = '', askPhone, askCode, askPassword }) {
    if (!window.telegram) throw new Error('Telegram client did not load');
    if (client?.connected) await client.disconnect();
    client = new window.telegram.TelegramClient(
      new window.telegram.sessions.StringSession(session),
      Number(apiId),
      apiHash,
      { connectionRetries: 2, requestRetries: 2, timeout: 10, useWSS: true }
    );
    await client.start({
      phoneNumber: askPhone,
      phoneCode: askCode,
      password: askPassword,
      onError: error => console.error('Telegram authorization:', error?.message || error)
    });
    return client.session.save();
  }

  async function messages(channel = 'Crypto_pravda1', limit = 100) {
    if (!client?.connected) throw new Error('Telegram is not connected');
    const rows = await client.getMessages(channel, { limit });
    return rows.filter(x => x.message).map(x => {
      const seconds = x.date instanceof Date ? x.date.getTime() : Number(x.date) * 1000;
      return { id: String(x.id), text: x.message, time: new Date(seconds).toISOString() };
    });
  }

  async function disconnect() {
    if (client) await client.disconnect();
    client = null;
  }

  window.SignalTelegram = { connect, messages, disconnect };
})();
