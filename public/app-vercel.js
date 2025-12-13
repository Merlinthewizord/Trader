class TradingTerminal {
  constructor() {
    this.ws = null;
    this.reconnectInterval = null;
    this.pollingInterval = null;
    this.elements = {
      chatContainer: document.getElementById('chat-container'),
      chatInput: document.getElementById('chat-input'),
      sendChatBtn: document.getElementById('send-chat-btn'),
      solBalance: document.getElementById('sol-balance'),
      walletAddress: document.getElementById('wallet-address'),
      reasoningContainer: document.getElementById('reasoning-container'),
      transactionsContainer: document.getElementById('transactions-container'),
      connectionStatus: document.getElementById('connection-status'),
      tradingStatus: document.getElementById('trading-status'),
      timestamp: document.getElementById('timestamp'),
    };

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.connectWebSocket();
    this.updateTradingStatus();
    this.updateTimestamp();

    // Poll wallet balance every 30 seconds as backup
    this.pollingInterval = setInterval(() => this.updateWalletInfo(), 30000);

    // Update timestamp every second
    setInterval(() => this.updateTimestamp(), 1000);
  }

  updateTimestamp() {
    if (!this.elements.timestamp) return;
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const dateString = now.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
    this.elements.timestamp.textContent = `${dateString} ${timeString}`;
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('Connecting to WebSocket:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.updateConnectionStatus(true);
        this.addActivityLog('system', 'Connected to trading bot');

        // Clear reconnect interval if exists
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }

        // Request initial wallet info
        this.updateWalletInfo();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        this.updateConnectionStatus(false);
        this.addActivityLog('error', 'Disconnected from trading bot. Reconnecting...');

        // Attempt to reconnect every 5 seconds
        if (!this.reconnectInterval) {
          this.reconnectInterval = setInterval(() => {
            console.log('Attempting to reconnect...');
            this.connectWebSocket();
          }, 5000);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus(false);
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.updateConnectionStatus(false);
    }
  }

  handleServerMessage(message) {
    console.log('📨 Server message:', message.type);

    switch (message.type) {
      case 'wallet_update':
        this.handleWalletUpdate(message.data);
        break;

      case 'autonomous_event':
        this.handleAutonomousEvent(message.data);
        break;

      case 'trade_decision':
        this.displayTradeDecision(message.data, message.data.autoExecuted || false);
        break;

      case 'chat_response':
        this.addActivityLog('assistant', message.data.message);
        break;

      case 'thinking':
        this.addActivityLog('thinking', message.data.message);
        break;

      case 'error':
        this.addActivityLog('error', message.data.message);
        break;
    }
  }

  handleWalletUpdate(data) {
    if (data.balance !== undefined) {
      this.elements.solBalance.textContent = data.balance.toFixed(4);
    }
    if (data.address) {
      this.elements.walletAddress.innerHTML = `<span class="address-label">ADDRESS:</span> <span class="address-value">${data.address}</span>`;
    }
  }

  handleAutonomousEvent(event) {
    switch (event.type) {
      case 'analysis':
        this.addActivityLog('system', event.data.message);
        if (event.data.balance !== undefined) {
          this.addActivityLog('info', `Wallet balance: ${event.data.balance.toFixed(4)} SOL`);
        }
        break;

      case 'decision':
        this.displayTradeDecision(event.data, true);
        break;

      case 'trade':
        this.addActivityLog('success',
          `✅ Auto-trade executed: ${event.data.action.toUpperCase()} ${event.data.tokenSymbol}\n` +
          `Signature: ${event.data.signature?.substring(0, 20)}...`
        );
        setTimeout(() => this.updateWalletInfo(), 2000);
        break;

      case 'error':
        this.addActivityLog('error', `❌ ${event.data.message}: ${event.data.error}`);
        break;
    }
  }

  updateConnectionStatus(connected) {
    if (connected) {
      this.elements.connectionStatus.classList.add('connected');
      this.elements.connectionStatus.querySelector('.status-text').textContent = 'API Online';
    } else {
      this.elements.connectionStatus.classList.remove('connected');
      this.elements.connectionStatus.querySelector('.status-text').textContent = 'Offline';
    }
  }

  async updateTradingStatus() {
    try {
      const response = await fetch('/api/scheduler/status');
      const data = await response.json();

      if (response.ok) {
        const isRunning = data.running;
        const statusEl = this.elements.tradingStatus;

        if (statusEl) {
          if (isRunning) {
            statusEl.classList.add('connected');
            const statusText = statusEl.querySelector('.status-text');
            if (statusText) statusText.textContent = 'ACTIVE';
          } else {
            statusEl.classList.remove('connected');
            const statusText = statusEl.querySelector('.status-text');
            if (statusText) statusText.textContent = 'STANDBY';
          }
        }
      }
    } catch (error) {
      console.error('Error updating trading status:', error);
    }
  }

  setupEventListeners() {
    // Chat functionality
    if (this.elements.sendChatBtn) {
      this.elements.sendChatBtn.addEventListener('click', () => this.sendChat());
    }
    if (this.elements.chatInput) {
      this.elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.sendChat();
      });
    }
  }

  sendChat() {
    const message = this.elements.chatInput.value.trim();
    if (!message) return;

    // Clear input
    this.elements.chatInput.value = '';

    // Add user message to activity feed
    this.addActivityLog('user', message);

    // Send to server via WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'chat',
        data: { message }
      }));
    } else {
      this.addActivityLog('error', 'Not connected to server. Please refresh the page.');
    }
  }

  async toggleTrading() {
    const isRunning = this.elements.toggleTradingBtn.getAttribute('data-running') === 'true';
    const endpoint = isRunning ? '/api/scheduler/stop' : '/api/scheduler/start';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        const action = isRunning ? 'stopped' : 'started';
        this.addActivityLog('system', `Autonomous trading ${action}`);
        await this.updateTradingStatus();
      } else {
        this.addActivityLog('error', data.error || 'Failed to toggle trading');
      }
    } catch (error) {
      this.addActivityLog('error', `Network error: ${error.message}`);
    }
  }

  async analyzeMarket() {
    this.addActivityLog('thinking', 'Running manual market analysis...');

    try {
      const response = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        this.displayTradeDecision(data.decision, false);

        // Ask user if they want to execute the trade
        if (data.decision.action !== 'hold') {
          // Format amount properly
          let amountText = data.decision.amount === 'all'
            ? 'ALL TOKENS'
            : (typeof data.decision.amount === 'number' ? `${data.decision.amount.toFixed(4)} SOL` : 'N/A');

          const execute = confirm(
            `Execute ${data.decision.action.toUpperCase()} trade for ${data.decision.tokenSymbol}?\n` +
            `Amount: ${amountText}\n` +
            `Confidence: ${data.decision.confidence}%\n\n` +
            `Reasoning: ${data.decision.reasoning}`
          );

          if (execute) {
            await this.executeTrade(data.decision);
          }
        }
      } else {
        this.addActivityLog('error', data.error || 'Failed to analyze market');
      }
    } catch (error) {
      this.addActivityLog('error', `Network error: ${error.message}`);
    }
  }

  async executeTrade(decision) {
    this.addActivityLog('thinking', 'Executing trade...');

    try {
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      const data = await response.json();

      if (response.ok) {
        this.addActivityLog('success', `✅ Trade executed! Signature: ${data.signature?.substring(0, 20)}...`);
        this.displayTradeDecision({ ...decision, executed: true, signature: data.signature }, false);

        // Update wallet info after trade
        setTimeout(() => this.updateWalletInfo(), 2000);
      } else {
        this.addActivityLog('error', `Trade failed: ${data.error}`);
      }
    } catch (error) {
      this.addActivityLog('error', `Network error: ${error.message}`);
    }
  }

  async updateWalletInfo() {
    try {
      const balanceResponse = await fetch('/api/wallet/balance');
      const balanceData = await balanceResponse.json();

      if (balanceResponse.ok) {
        this.elements.solBalance.textContent = balanceData.balance.toFixed(4);
        this.elements.walletAddress.innerHTML = `<span class="address-label">ADDRESS:</span> <span class="address-value">${balanceData.address}</span>`;
      }

      const txResponse = await fetch('/api/wallet/transactions?limit=5');
      const txData = await txResponse.json();

      if (txResponse.ok && txData.transactions && txData.transactions.length > 0) {
        const placeholder = this.elements.transactionsContainer.querySelector('.placeholder, .no-data');
        if (placeholder) placeholder.remove();

        this.elements.transactionsContainer.innerHTML = txData.transactions
          .map((tx) => {
            // Format timestamp
            const timestamp = tx.blockTime
              ? new Date(tx.blockTime * 1000).toLocaleString()
              : 'Unknown time';

            // Shorten asset address if it's a long token mint
            let assetDisplay = tx.asset || 'Unknown';
            if (assetDisplay.length > 20) {
              assetDisplay = assetDisplay.substring(0, 8) + '...' + assetDisplay.substring(assetDisplay.length - 6);
            }

            // Format amount with proper decimals
            const amountDisplay = typeof tx.amount === 'number' && tx.amount > 0
              ? tx.amount.toFixed(6)
              : '0';

            // Get action emoji
            const actionEmoji = {
              'Buy': '🟢',
              'Sell': '🔴',
              'Send': '📤',
              'Receive': '📥',
              'Unknown': '❓'
            }[tx.action] || '❓';

            return `
              <div class="transaction-item">
                <div style="font-weight: bold; display: flex; align-items: center; gap: 8px;">
                  ${actionEmoji} ${tx.action || 'Unknown'} ${assetDisplay}
                </div>
                <div style="font-size: 0.9em; margin-top: 4px;">
                  Amount: ${amountDisplay} • Fee: ${(tx.fee || 0).toFixed(6)} SOL
                </div>
                <div style="font-size: 0.85em; opacity: 0.7; margin-top: 4px;">
                  ${timestamp}
                </div>
                <div style="font-size: 0.8em; opacity: 0.5; margin-top: 4px; font-family: monospace;">
                  ${tx.signature.substring(0, 16)}...
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

  addActivityLog(type, content) {
    const welcomeMsg = this.elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) welcomeMsg.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const timestamp = new Date().toLocaleTimeString();
    const labels = {
      system: '⚙️ System',
      info: 'ℹ️ Info',
      success: '✅ Success',
      thinking: '💭 Processing',
      error: '❌ Error',
      assistant: '🤖 Agent',
    };

    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-label">${labels[type] || type}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      <div class="message-content">${this.escapeHtml(content)}</div>
    `;

    this.elements.chatContainer.appendChild(messageDiv);
    this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;

    // Keep only last 100 messages
    const messages = this.elements.chatContainer.querySelectorAll('.message');
    if (messages.length > 100) {
      messages[0].remove();
    }
  }

  displayTradeDecision(decision, isAutomated) {
    const reasoningDiv = document.createElement('div');
    reasoningDiv.className = 'trade-decision';

    const actionClass = decision.action.toLowerCase();
    const actionEmoji = {
      buy: '🟢',
      sell: '🔴',
      hold: '🟡',
    }[actionClass] || '⚪';

    const badge = isAutomated ? '<span class="auto-badge">AUTO</span>' : '<span class="manual-badge">MANUAL</span>';

    let detailsHtml = '';
    if (decision.tokenSymbol) {
      // Handle amount being either a number or "all"
      let amountDisplay = 'N/A';
      if (decision.amount === 'all') {
        amountDisplay = 'ALL TOKENS';
      } else if (typeof decision.amount === 'number') {
        amountDisplay = decision.amount.toFixed(4) + ' SOL';
      }

      detailsHtml = `
        <div class="trade-details">
          Token: ${decision.tokenSymbol}<br>
          Amount: ${amountDisplay}<br>
          Risk Level: ${decision.riskLevel.toUpperCase()}<br>
          Confidence: ${decision.confidence}%
        </div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${decision.confidence}%"></div>
        </div>
      `;
    }

    reasoningDiv.innerHTML = `
      <div class="trade-header">
        <div class="trade-action ${actionClass}">
          ${actionEmoji} ${decision.action.toUpperCase()}
        </div>
        ${badge}
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

    const modeLabel = isAutomated ? '[AUTO]' : '[MANUAL]';
    this.addActivityLog(
      decision.action === 'hold' ? 'info' : 'success',
      `${modeLabel} Trade Decision: ${decision.action.toUpperCase()}\n${decision.reasoning.substring(0, 200)}${decision.reasoning.length > 200 ? '...' : ''}`
    );

    if (decision.executed && decision.signature) {
      this.addActivityLog('success', `✅ Trade executed! Signature: ${decision.signature.substring(0, 20)}...`);
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
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const terminal = new TradingTerminal();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => terminal.cleanup());
});
