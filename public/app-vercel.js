class TradingTerminal {
  constructor() {
    this.pollingInterval = null;
    this.statusPollingInterval = null;
    this.elements = {
      chatContainer: document.getElementById('chat-container'),
      toggleTradingBtn: document.getElementById('toggle-trading-btn'),
      analyzeBtn: document.getElementById('analyze-btn'),
      solBalance: document.getElementById('sol-balance'),
      walletAddress: document.getElementById('wallet-address'),
      reasoningContainer: document.getElementById('reasoning-container'),
      transactionsContainer: document.getElementById('transactions-container'),
      connectionStatus: document.getElementById('connection-status'),
      tradingStatus: document.getElementById('trading-status'),
    };

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateWalletInfo();
    this.updateConnectionStatus(true);
    this.updateTradingStatus();

    // Poll wallet balance every 30 seconds
    this.pollingInterval = setInterval(() => this.updateWalletInfo(), 30000);

    // Poll trading status every 5 seconds
    this.statusPollingInterval = setInterval(() => this.updateTradingStatus(), 5000);
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
        const btnEl = this.elements.toggleTradingBtn;

        if (isRunning) {
          statusEl.classList.add('connected');
          statusEl.querySelector('.status-text').textContent = '🤖 Auto-Trading';
          btnEl.textContent = '⏸️ Stop Auto-Trading';
          btnEl.setAttribute('data-running', 'true');
        } else {
          statusEl.classList.remove('connected');
          statusEl.querySelector('.status-text').textContent = '⏸️ Paused';
          btnEl.textContent = '▶️ Start Auto-Trading';
          btnEl.setAttribute('data-running', 'false');
        }
      }
    } catch (error) {
      console.error('Error updating trading status:', error);
    }
  }

  setupEventListeners() {
    this.elements.toggleTradingBtn.addEventListener('click', () => this.toggleTrading());
    this.elements.analyzeBtn.addEventListener('click', () => this.analyzeMarket());
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
        this.displayTradeDecision({ ...decision, executed: true, signature: data.signature }, true);

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
        this.elements.walletAddress.textContent = `Address: ${balanceData.address}`;
      }

      const txResponse = await fetch('/api/wallet/transactions?limit=5');
      const txData = await txResponse.json();

      if (txResponse.ok && txData.transactions && txData.transactions.length > 0) {
        const placeholder = this.elements.transactionsContainer.querySelector('.placeholder');
        if (placeholder) placeholder.remove();

        this.elements.transactionsContainer.innerHTML = txData.transactions
          .map((tx) => {
            return `
              <div class="transaction-item">
                <div style="font-weight: bold;">${tx.type} ${tx.status}</div>
                <div style="font-size: 0.9em; opacity: 0.8;">${tx.timestamp}</div>
                <div style="font-size: 0.85em;">Fee: ${tx.fee}</div>
                <div class="transaction-signature" style="font-size: 0.8em; opacity: 0.6;">
                  ${tx.signature.substring(0, 30)}...
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

  handleAutonomousEvent(event) {
    switch (event.type) {
      case 'analysis':
        this.addActivityLog('system', event.data.message);
        if (event.data.balance !== undefined) {
          this.addActivityLog('info', `Wallet balance: ${event.data.balance.toFixed(4)} SOL`);
        }
        break;

      case 'decision':
        this.displayTradeDecision(event.data, event.data.autoExecuted || false);
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
    if (this.statusPollingInterval) {
      clearInterval(this.statusPollingInterval);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const terminal = new TradingTerminal();

  // Note: WebSocket functionality could be added here in the future
  // For now, we use polling to check status and activity

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => terminal.cleanup());
});
