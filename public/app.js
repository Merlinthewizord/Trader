class TradingTerminal {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

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
    this.setupWebSocket();
    this.setupEventListeners();
    this.refreshTransactions(); // Load initial transactions

    // Refresh transactions every 30 seconds
    setInterval(() => this.refreshTransactions(), 30000);
  }

  setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleServerMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.updateConnectionStatus(false);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.updateConnectionStatus(false);
      this.attemptReconnect();
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(() => this.setupWebSocket(), delay);
    } else {
      this.addMessage('error', 'Connection lost. Please refresh the page.');
    }
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

  sendMessage() {
    const message = this.elements.chatInput.value.trim();
    if (!message) return;

    this.addMessage('user', message);
    this.elements.chatInput.value = '';

    this.sendToServer({
      type: 'chat',
      data: { message },
    });
  }

  analyzeMarket() {
    this.addMessage('thinking', 'Analyzing market conditions...');

    this.sendToServer({
      type: 'analyze',
      data: {},
    });
  }

  sendToServer(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.addMessage('error', 'Not connected to server. Please wait...');
    }
  }

  handleServerMessage(message) {
    console.log('Received:', message);

    switch (message.type) {
      case 'chat_response':
        this.addMessage('assistant', message.data.message);
        break;

      case 'trade_decision':
        this.displayTradeDecision(message.data);
        break;

      case 'wallet_update':
        this.updateWalletInfo(message.data);
        break;

      case 'autonomous_event':
        this.handleAutonomousEvent(message.data);
        break;

      case 'thinking':
        this.addMessage('thinking', message.data.message);
        break;

      case 'error':
        this.addMessage('error', message.data.message);
        break;
    }
  }

  addMessage(type, content) {
    // Remove welcome message if present
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

    // Clear placeholder
    const placeholder = this.elements.reasoningContainer.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    this.elements.reasoningContainer.insertBefore(
      reasoningDiv,
      this.elements.reasoningContainer.firstChild
    );

    // Add to chat as well
    this.addMessage(
      'assistant',
      `Trade Decision: ${decision.action.toUpperCase()}\n${decision.reasoning}`
    );

    // If executed, show success
    if (decision.executed && decision.signature) {
      this.addMessage('assistant', `✅ Trade executed! Signature: ${decision.signature.substring(0, 20)}...`);
    }
  }

  async handleAutonomousEvent(event) {
    console.log('Autonomous event:', event);

    switch (event.type) {
      case 'analysis':
        if (event.data.message) {
          this.addMessage('thinking', event.data.message);
        }
        break;

      case 'decision':
        this.displayTradeDecision(event.data);
        break;

      case 'trade':
        // Trade was executed
        const tradeMsg = `✅ Trade executed: ${event.data.action.toUpperCase()} ${event.data.tokenSymbol || 'token'} (${event.data.confidence}% confidence)`;
        this.addMessage('assistant', tradeMsg);

        if (event.data.signature) {
          this.addMessage('assistant', `📝 Signature: ${event.data.signature.substring(0, 30)}...`);
        }

        // Refresh transaction log immediately
        await this.refreshTransactions();
        break;

      case 'error':
        this.addMessage('error', event.data.message || 'An error occurred');
        break;

      default:
        if (event.data && event.data.message) {
          this.addMessage('assistant', event.data.message);
        }
    }
  }

  async refreshTransactions() {
    try {
      const response = await fetch('/api/wallet/transactions?limit=10');
      const data = await response.json();

      if (data.transactions && data.transactions.length > 0) {
        this.updateTransactionLog(data.transactions);
      }
    } catch (error) {
      console.error('Error refreshing transactions:', error);
    }
  }

  updateTransactionLog(transactions) {
    const placeholder = this.elements.transactionsContainer.querySelector('.placeholder');
    if (placeholder) placeholder.remove();

    this.elements.transactionsContainer.innerHTML = transactions
      .map((tx) => {
        return `
          <div class="transaction-item">
            <div class="tx-time">${tx.timestamp}</div>
            <div class="tx-type">${tx.type}</div>
            <div class="tx-status">${tx.status}</div>
            <div class="tx-signature">
              <a href="https://solscan.io/tx/${tx.signature}" target="_blank">
                ${tx.signature.substring(0, 20)}...
              </a>
            </div>
            <div class="tx-fee">Fee: ${tx.fee}</div>
          </div>
        `;
      })
      .join('');
  }

  updateWalletInfo(data) {
    this.elements.solBalance.textContent = data.balance.toFixed(4);
    this.elements.walletAddress.textContent = `Address: ${data.address}`;

    if (data.transactions && data.transactions.length > 0) {
      this.updateTransactionLog(data.transactions);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the terminal when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new TradingTerminal();
});
