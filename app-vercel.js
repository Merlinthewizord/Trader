class TradingTerminal {
  constructor() {
    this.pollingInterval = null;
    this.elements = {
      chatContainer: document.getElementById('chat-container'),
      chatInput: document.getElementById('chat-input'),
      sendBtn: document.getElementById('send-btn'),
      analyzeBtn: document.getElementById('analyze-btn'),
      solBalance: document.getElementById('sol-balance'),
      walletAddress: document.getElementById('wallet-address'),
      reasoningContainer: document.getElementById('reasoning-container'),
      transactionsContainer: document.getElementById('transactions-container'),
      connectionStatus: document.getElementById('connection-status'),
    };

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateWalletInfo();
    this.updateConnectionStatus(true);

    // Poll wallet balance every 30 seconds
    this.pollingInterval = setInterval(() => this.updateWalletInfo(), 30000);
  }

  updateConnectionStatus(connected) {
    if (connected) {
      this.elements.connectionStatus.classList.add('connected');
      this.elements.connectionStatus.querySelector('.status-text').textContent = 'Connected';
    } else {
      this.elements.connectionStatus.classList.remove('connected');
      this.elements.connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
    }
  }

  setupEventListeners() {
    this.elements.sendBtn.addEventListener('click', () => this.sendMessage());

    this.elements.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    this.elements.analyzeBtn.addEventListener('click', () => this.analyzeMarket());
  }

  async sendMessage() {
    const message = this.elements.chatInput.value.trim();
    if (!message) return;

    this.addMessage('user', message);
    this.elements.chatInput.value = '';

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (response.ok) {
        this.addMessage('assistant', data.response);
      } else {
        this.addMessage('error', data.error || 'Failed to get response');
      }
    } catch (error) {
      this.addMessage('error', `Network error: ${error.message}`);
    }
  }

  async analyzeMarket() {
    this.addMessage('thinking', 'Analyzing market conditions...');

    try {
      const response = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        this.displayTradeDecision(data.decision);

        // Ask user if they want to execute the trade
        if (data.decision.action !== 'hold') {
          const execute = confirm(
            `Execute ${data.decision.action.toUpperCase()} trade for ${data.decision.tokenSymbol}?\n` +
            `Amount: ${data.decision.amount} SOL\n` +
            `Confidence: ${data.decision.confidence}%\n\n` +
            `Reasoning: ${data.decision.reasoning}`
          );

          if (execute) {
            await this.executeTrade(data.decision);
          }
        }
      } else {
        this.addMessage('error', data.error || 'Failed to analyze market');
      }
    } catch (error) {
      this.addMessage('error', `Network error: ${error.message}`);
    }
  }

  async executeTrade(decision) {
    this.addMessage('thinking', 'Executing trade...');

    try {
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      const data = await response.json();

      if (response.ok) {
        this.addMessage('assistant', `✅ Trade executed! Signature: ${data.signature?.substring(0, 20)}...`);
        this.displayTradeDecision({ ...data.decision, executed: true, signature: data.signature });

        // Update wallet info after trade
        setTimeout(() => this.updateWalletInfo(), 2000);
      } else {
        this.addMessage('error', `Trade failed: ${data.error}`);
      }
    } catch (error) {
      this.addMessage('error', `Network error: ${error.message}`);
    }
  }

  async updateWalletInfo() {
    try {
      const balanceResponse = await fetch('/api/wallet/balance');
      const balanceData = await balanceResponse.json();

      if (balanceResponse.ok) {
        this.elements.solBalance.textContent = balanceData.balance.toFixed(4);
        this.elements.walletAddress.textContent = `Address: ${balanceData.address}`;
      }

      const txResponse = await fetch('/api/wallet/transactions?limit=5');
      const txData = await txResponse.json();

      if (txResponse.ok && txData.transactions && txData.transactions.length > 0) {
        const placeholder = this.elements.transactionsContainer.querySelector('.placeholder');
        if (placeholder) placeholder.remove();

        this.elements.transactionsContainer.innerHTML = txData.transactions
          .map((tx) => {
            const date = new Date(tx.blockTime * 1000).toLocaleString();
            return `
              <div class="transaction-item">
                <div>Block: ${tx.slot}</div>
                <div>Time: ${date}</div>
                <div class="transaction-signature">
                  ${tx.signature.substring(0, 40)}...
                </div>
              </div>
            `;
          })
          .join('');
      }
    } catch (error) {
      console.error('Error updating wallet info:', error);
    }
  }

  addMessage(type, content) {
    const welcomeMsg = this.elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) welcomeMsg.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const labels = {
      user: '👤 You',
      assistant: '🤖 Agent',
      thinking: '💭 Thinking',
      error: '❌ Error',
    };

    messageDiv.innerHTML = `
      <div class="message-label">${labels[type] || type}</div>
      <div class="message-content">${this.escapeHtml(content)}</div>
    `;

    this.elements.chatContainer.appendChild(messageDiv);
    this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
  }

  displayTradeDecision(decision) {
    const reasoningDiv = document.createElement('div');
    reasoningDiv.className = 'trade-decision';

    const actionClass = decision.action.toLowerCase();
    const actionEmoji = {
      buy: '🟢',
      sell: '🔴',
      hold: '🟡',
    }[actionClass] || '⚪';

    let detailsHtml = '';
    if (decision.tokenSymbol) {
      detailsHtml = `
        <div class="trade-details">
          Token: ${decision.tokenSymbol}<br>
          Amount: ${decision.amount ? decision.amount.toFixed(4) + ' SOL' : 'N/A'}<br>
          Risk Level: ${decision.riskLevel.toUpperCase()}<br>
          Confidence: ${decision.confidence}%
        </div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${decision.confidence}%"></div>
        </div>
      `;
    }

    reasoningDiv.innerHTML = `
      <div class="trade-action ${actionClass}">
        ${actionEmoji} ${decision.action.toUpperCase()}
      </div>
      ${detailsHtml}
      <div class="trade-reasoning">
        ${this.escapeHtml(decision.reasoning)}
      </div>
    `;

    const placeholder = this.elements.reasoningContainer.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    this.elements.reasoningContainer.insertBefore(
      reasoningDiv,
      this.elements.reasoningContainer.firstChild
    );

    this.addMessage(
      'assistant',
      `Trade Decision: ${decision.action.toUpperCase()}\n${decision.reasoning}`
    );

    if (decision.executed && decision.signature) {
      this.addMessage('assistant', `✅ Trade executed! Signature: ${decision.signature.substring(0, 20)}...`);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  cleanup() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const terminal = new TradingTerminal();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => terminal.cleanup());
});
