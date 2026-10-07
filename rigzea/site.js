(() => {
  const menu = document.querySelector('#mobile-nav');
  const toggle = document.querySelector('#mobile-toggle');
  
  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'მენიუს დახურვა' : 'მენიუს გახსნა');
  });

  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));

  // Billing interval toggle (Monthly vs Yearly)
  document.querySelectorAll('.billing-toggle button').forEach(button => button.addEventListener('click', () => {
    const yearly = button.dataset.billing === 'yearly';
    document.querySelectorAll('.billing-toggle button').forEach(b => {
      const active = b === button;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('.plan-price[data-monthly]').forEach(price => {
      price.innerHTML = `${yearly ? price.dataset.yearly : price.dataset.monthly} <small>/ ${yearly ? 'წელი' : 'თვე'}</small>`;
    });
  }));

  // Interactive Telegram Transformation samples
  const tgSamples = [
    {
      channel: 'Telegram შეტყობინება · 11:02',
      text: '„1204-ში კონდიციონერი გაფუჭდა, 170 ლარია.“',
      apt: 'Orbi City · 1204',
      issue: 'კონდიციონერის შეკეთება',
      cost: '₾170',
      status: 'ელოდება თანხმობას',
      statusClass: 'wait'
    },
    {
      channel: 'Telegram შეტყობინება · 12:40',
      text: '„ვაკეში 18-ში სანტექნიკოსი მოვიდა, 90 ლარია.“',
      apt: 'Vake Residence · 18',
      issue: 'სანტექნიკის შეკეთება',
      cost: '₾90',
      status: 'ელოდება თანხმობას',
      statusClass: 'wait'
    },
    {
      channel: 'Telegram შეტყობინება · 14:15',
      text: '„ბათუმში 7 ნომერში დასუფთავება დასრულდა.“',
      apt: 'Old Batumi · 7',
      issue: 'გენერალური დასუფთავება',
      cost: '₾80',
      status: 'შესრულებულია',
      statusClass: 'done'
    }
  ];

  const pillButtons = document.querySelectorAll('.telegram-pill-btn');
  pillButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      pillButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sample = tgSamples[Number(btn.dataset.msgIdx)] || tgSamples[0];

      const textEl = document.querySelector('#tg-preview-text');
      const timeEl = document.querySelector('#tg-preview-channel');
      const aptEl = document.querySelector('#tg-target-apt');
      const issueEl = document.querySelector('#tg-target-issue');
      const costEl = document.querySelector('#tg-target-cost');
      const statusEl = document.querySelector('#tg-target-status');

      if (textEl) textEl.textContent = sample.text;
      if (timeEl) timeEl.textContent = sample.channel;
      if (aptEl) aptEl.textContent = sample.apt;
      if (issueEl) issueEl.textContent = sample.issue;
      if (costEl) costEl.textContent = sample.cost;
      if (statusEl) {
        statusEl.textContent = sample.status;
        statusEl.className = `status-pill ${sample.statusClass}`;
      }
    });
  });
})();
