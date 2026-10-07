// Supabase Configuration & Core Rigzea Client Infrastructure
window.RIGZEA_CONFIG = {
  SUPABASE_URL: 'https://pwasuamrqxyhhyqxfrjz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YXN1YW1ycXh5aGh5cXhmcmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTk0NjgsImV4cCI6MjEwNjE5NTQ2OH0.f17SPN36R4k2uoUYgs1zWeiMVmMpcinaBkrBMFK8FC0',
  APP_URL: window.location.origin
};

// Initialize Supabase client
window.supabaseClient = supabase.createClient(
  window.RIGZEA_CONFIG.SUPABASE_URL,
  window.RIGZEA_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// Global State Management
window.RigzeaStore = {
  user: null,
  session: null,
  organizations: [],
  currentOrg: null,
  currentMember: null,
  apartments: [],
  owners: [],
  tasks: [],
  repairs: [],
  approvals: [],
  expenses: [],
  income: [],
  activityEvents: [],
  notifications: [],
  
  async initAuth() {
    const { data: { session }, error } = await window.supabaseClient.auth.getSession();
    this.session = session;
    this.user = session ? session.user : null;
    return this.user;
  },

  async loadOrganizations() {
    if (!this.user) return [];
    
    // Fetch organizations where user is a member
    const { data: members, error: memErr } = await window.supabaseClient
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', this.user.id);
      
    if (memErr) {
      console.error('Error loading org members:', memErr);
      return [];
    }

    this.organizations = members.map(m => ({
      ...m.organizations,
      membership: {
        id: m.id,
        role: m.role,
        display_name: m.display_name
      }
    }));

    if (this.organizations.length > 0) {
      // Pick saved or first organization
      const savedOrgId = localStorage.getItem('rigzea_selected_org_id');
      this.currentOrg = this.organizations.find(o => o.id === savedOrgId) || this.organizations[0];
      this.currentMember = this.currentOrg.membership;
      localStorage.setItem('rigzea_selected_org_id', this.currentOrg.id);
    } else {
      this.currentOrg = null;
      this.currentMember = null;
    }

    return this.organizations;
  },

  async switchOrganization(orgId) {
    const target = this.organizations.find(o => o.id === orgId);
    if (!target) return false;
    this.currentOrg = target;
    this.currentMember = target.membership;
    localStorage.setItem('rigzea_selected_org_id', target.id);
    await this.loadAllOrgData();
    return true;
  },

  async loadAllOrgData() {
    if (!this.currentOrg) return;
    const orgId = this.currentOrg.id;

    const [aptsRes, ownersRes, tasksRes, repairsRes, approvalsRes, expensesRes, incomeRes, eventsRes, notifRes] = await Promise.all([
      window.supabaseClient.from('apartments').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      window.supabaseClient.from('owners').select('*').eq('organization_id', orgId).order('name', { ascending: true }),
      window.supabaseClient.from('tasks').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      window.supabaseClient.from('repairs').select('*').eq('organization_id', orgId).order('reported_date', { ascending: false }),
      window.supabaseClient.from('approvals').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      window.supabaseClient.from('expenses').select('*').eq('organization_id', orgId).order('expense_date', { ascending: false }),
      window.supabaseClient.from('income').select('*').eq('organization_id', orgId).order('income_date', { ascending: false }),
      window.supabaseClient.from('activity_events').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(50),
      window.supabaseClient.from('notifications').select('*').eq('organization_id', orgId).eq('user_id', this.user.id).order('created_at', { ascending: false }).limit(20)
    ]);

    this.apartments = aptsRes.data || [];
    this.owners = ownersRes.data || [];
    this.tasks = tasksRes.data || [];
    this.repairs = repairsRes.data || [];
    this.approvals = approvalsRes.data || [];
    this.expenses = expensesRes.data || [];
    this.income = incomeRes.data || [];
    this.activityEvents = eventsRes.data || [];
    this.notifications = notifRes.data || [];
  },

  // Helper for logging automated activity events in timeline
  async logActivity(apartmentId, eventType, title, description = '', metadata = {}) {
    if (!this.currentOrg) return null;
    const actorName = this.currentMember?.display_name || this.user?.email || 'მმართველი';

    const { data, error } = await window.supabaseClient
      .from('activity_events')
      .insert({
        organization_id: this.currentOrg.id,
        apartment_id: apartmentId,
        actor_id: this.user?.id,
        actor_name: actorName,
        event_type: eventType,
        title,
        description,
        metadata
      })
      .select()
      .single();

    if (!error && data) {
      this.activityEvents.unshift(data);
    }
    return data;
  }
};

// Formatting Utilities
window.RigzeaUtils = {
  formatMoney(num) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return '₾' + Number(num).toLocaleString('ka-GE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const months = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  formatTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return `${this.formatDate(dateStr)} ${this.formatTime(dateStr)}`;
  },

  escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
};
