const state = {
  categories: [],
  transactions: [],
  products: [],
  users: [],
  risks: [],
  currentUser: null,
  sessionToken: "",
  selectedProductId: "",
  marketError: "",
  authMode: "login",
  myProducts: [],
  myProductsLoaded: false,
  myProductsError: "",
  myProductFilter: "all",
  tradeRecords: [],
  transactionsLoaded: false,
  transactionsError: "",
  transactionRole: "buyer",
  editingProductId: "",
  favorites: [],
  favoritesLoaded: false,
  favoritesError: "",
  conversations: [],
  conversationsLoaded: false,
  conversationsError: "",
  activeConversation: null,
  activeMessages: [],
  messageThreadLoading: false,
  messageSending: false,
  pendingConversation: null,
  mobileThreadOpen: false,
  aiReports: [],
  aiReportsLoaded: false,
  aiReportsError: "",
  aiReportType: "all",
  accountTab: "profile",
  adminTab: "overview",
  adminOverview: null,
  adminUsers: [],
  adminProducts: [],
  adminRisks: [],
  adminLogs: [],
  adminAction: null,
  recognition: null,
  listing: null,
  latestPrice: null,
  sellerPriceTouched: false,
  uploads: {},
  activeRoute: "market"
};

const $ = (id) => document.getElementById(id);
const LOCAL_PRODUCTS_KEY = "campusLoopLocalProducts";
const SESSION_USER_KEY = "campusLoopCurrentUser";
const SESSION_TOKEN_KEY = "campusLoopSessionToken";
const SELECTED_PRODUCT_KEY = "campusLoopSelectedProduct";

function showSuccessDialog(message) {
  const dialog = $("successDialog");
  const confirmButton = $("successDialogConfirm");
  $("successDialogMessage").textContent = message;

  return new Promise((resolve) => {
    const preventCancel = (event) => event.preventDefault();
    const confirm = () => {
      dialog.removeEventListener("cancel", preventCancel);
      dialog.close();
      resolve();
    };
    dialog.addEventListener("cancel", preventCancel);
    confirmButton.addEventListener("click", confirm, { once: true });
    dialog.showModal();
  });
}

function showConfirmDialog(message, confirmLabel = "确认") {
  const dialog = $("confirmDialog");
  const cancelButton = $("confirmDialogCancel");
  const confirmButton = $("confirmDialogSubmit");
  $("confirmDialogMessage").textContent = message;
  confirmButton.textContent = confirmLabel;

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      cancelButton.removeEventListener("click", cancel);
      confirmButton.removeEventListener("click", confirm);
      dialog.removeEventListener("cancel", cancelDialog);
      dialog.close();
      resolve(confirmed);
    };
    const cancel = () => finish(false);
    const confirm = () => finish(true);
    const cancelDialog = (event) => {
      event.preventDefault();
      finish(false);
    };
    cancelButton.addEventListener("click", cancel);
    confirmButton.addEventListener("click", confirm);
    dialog.addEventListener("cancel", cancelDialog);
    dialog.showModal();
  });
}

const routes = {
  market: "page-market",
  detail: "page-detail",
  "my-products": "page-my-products",
  "my-transactions": "page-my-transactions",
  "my-favorites": "page-my-favorites",
  messages: "page-messages",
  "ai-history": "page-ai-history",
  estimate: "page-estimate",
  authenticity: "page-authenticity",
  publish: "page-publish",
  search: "page-search",
  "account-settings": "page-account-settings",
  admin: "page-admin",
  login: "page-login"
};

async function fetchWithTimeout(url, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson(url, options = {}, timeout = 9000) {
  const response = await fetchWithTimeout(
    url,
    options,
    timeout
  );
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "服务器返回了无法读取的内容。");
  }
  if (!response.ok || payload?.ok === false) {
    throw new ApiError(response.status, payload?.error || `请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

async function getJson(url, headers = {}) {
  return requestJson(url, { headers });
}

async function postJson(url, body, headers = {}) {
  return requestJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    },
    12000
  );
}

async function patchJson(url, body, headers = {}) {
  return requestJson(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    },
    12000
  );
}

async function deleteJson(url, headers = {}) {
  return requestJson(
    url,
    {
      method: "DELETE",
      headers
    },
    12000
  );
}

async function deleteJsonWithBody(url, body, headers = {}) {
  return requestJson(
    url,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body)
    },
    12000
  );
}

function apiErrorMessage(error, fallback = "请求失败，请检查本地服务是否正在运行。") {
  if (error?.name === "AbortError") return "网络连接超时，请稍后重试。";
  if (error?.status === 400) return `输入内容不符合要求：${error.message || "请检查后重试。"}`;
  if (error?.status === 401) return error.message || "账号密码错误或登录已失效。";
  if (error?.status === 409) return "账号已经存在，请直接登录或更换账号。";
  if (error?.status === 413) return "图片或请求内容过大，请压缩图片后重试。";
  if (error?.status === 503) return "服务暂时不可用，请稍后重试。";
  if (error instanceof TypeError) return "网络连接失败，请确认本地服务正在运行。";
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
}

function marketplaceErrorMessage(error, fallback = "操作失败，请稍后重试。") {
  if (error?.status === 400) return error.message || "输入内容不符合要求。";
  if (error?.status === 401) return "登录已失效，请重新登录。";
  if (error?.status === 403) return error.message || "你没有权限执行此操作。";
  if (error?.status === 404) return error.message || "商品或交易不存在。";
  if (error?.status === 409) return error.message || "当前状态不允许执行此操作。";
  return apiErrorMessage(error, fallback);
}

function storageLabel(storage) {
  if (storage === "sql-server") return "SQL Server";
  if (storage === "json") return "data/db.json";
  return "后端数据源";
}

function money(value) {
  return `¥${Math.round(Number(value) || 0).toLocaleString("zh-CN")}`;
}

function discountText(item) {
  if (!item.originalPrice || Number(item.originalPrice) <= Number(item.price)) return "";
  const discount = Math.max(1, Math.round((Number(item.price) / Number(item.originalPrice)) * 100));
  return `${discount}折`;
}

function productTrust(item) {
  return Number(item.trust || item.trustScore || 90);
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fallbackImage(label = "商品图", tone = "#d8ff4f") {
  const safeLabel = String(label || "商品图").slice(0, 8);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
      <rect width="900" height="640" fill="#f8f6ec"/>
      <path d="M0 0h900v640H0z" fill="none"/>
      <g opacity=".5" stroke="#d8d4c4" stroke-width="2">
        ${Array.from({ length: 19 }, (_, i) => `<path d="M${i * 50} 0v640"/>`).join("")}
        ${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${i * 50}h900"/>`).join("")}
      </g>
      <rect x="118" y="132" width="664" height="376" rx="44" fill="${tone}" stroke="#080d0b" stroke-width="10"/>
      <circle cx="450" cy="276" r="66" fill="#f8f6ec" stroke="#080d0b" stroke-width="10"/>
      <path d="M300 436h300" stroke="#080d0b" stroke-width="18" stroke-linecap="round"/>
      <text x="450" y="575" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="58" font-weight="900" fill="#080d0b">${safeLabel}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function imageFallbackFor(category) {
  const tones = {
    数码电子: "#d8ff4f",
    运动户外: "#ff765d",
    生活用品: "#d7e7ec",
    图书教材: "#efe6c5"
  };
  return fallbackImage(category || "商品图", tones[category] || "#d8ff4f");
}

function loadLocalProducts() {
  try {
    const products = JSON.parse(localStorage.getItem(LOCAL_PRODUCTS_KEY) || "[]");
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

function saveLocalProducts(products) {
  localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products.slice(0, 30)));
}

function rememberLocalProduct(product) {
  if (!product?.id) return;
  const products = [product, ...loadLocalProducts().filter((item) => item.id !== product.id)];
  saveLocalProducts(products);
}

function mergeProducts(remoteProducts = []) {
  const merged = new Map();
  const products = remoteProducts.length ? remoteProducts : loadLocalProducts();
  products.forEach((product) => {
    if (product?.id && !merged.has(product.id)) merged.set(product.id, product);
  });
  return [...merged.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function showAllMarketTab() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
}

function hasAuthenticatedSession() {
  return Boolean(state.currentUser?.id && state.sessionToken);
}

function authHeaders() {
  return hasAuthenticatedSession() ? { Authorization: `Bearer ${state.sessionToken}` } : {};
}

function resetMarketplaceState() {
  state.myProducts = [];
  state.myProductsLoaded = false;
  state.myProductsError = "";
  state.myProductFilter = "all";
  state.tradeRecords = [];
  state.transactionsLoaded = false;
  state.transactionsError = "";
  state.transactionRole = "buyer";
  state.editingProductId = "";
  state.favorites = [];
  state.favoritesLoaded = false;
  state.favoritesError = "";
  state.conversations = [];
  state.conversationsLoaded = false;
  state.conversationsError = "";
  state.activeConversation = null;
  state.activeMessages = [];
  state.messageThreadLoading = false;
  state.messageSending = false;
  state.pendingConversation = null;
  state.mobileThreadOpen = false;
  state.aiReports = [];
  state.aiReportsLoaded = false;
  state.aiReportsError = "";
  state.aiReportType = "all";
  state.accountTab = "profile";
  state.adminTab = "overview";
  state.adminOverview = null;
  state.adminUsers = [];
  state.adminProducts = [];
  state.adminRisks = [];
  state.adminLogs = [];
  state.adminAction = null;
}

function persistSession(account) {
  const { sessionToken, ...currentUser } = account || {};
  if (!currentUser.id || !sessionToken) throw new Error("登录信息不完整，请重新登录。" );
  resetMarketplaceState();
  state.currentUser = currentUser;
  state.sessionToken = sessionToken;
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
  sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
}

async function restoreSession() {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || "null");
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    if (!currentUser?.id || !sessionToken) throw new Error("Incomplete session");
    state.currentUser = currentUser;
    state.sessionToken = sessionToken;
    const response = await getJson("/api/auth/session", authHeaders());
    if (!response.data?.id) throw new Error("Invalid session user");
    state.currentUser = response.data;
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(response.data));
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function clearSession() {
  resetMarketplaceState();
  state.currentUser = null;
  state.sessionToken = "";
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function setRoute(routeName) {
  let route = routes[routeName] ? routeName : "market";
  const protectedRoutes = new Set(["publish", "my-products", "my-transactions", "my-favorites", "messages", "ai-history", "account-settings", "admin"]);
  if (protectedRoutes.has(route) && !hasAuthenticatedSession()) {
    route = "login";
    $("loginStatus").textContent = "请先登录，再使用商品管理和交易功能。";
  }
  if (route === "admin" && state.currentUser?.role !== "admin") {
    route = "account-settings";
    setTimeout(() => setWorkspaceStatus("accountPageStatus", "无权访问管理后台：当前账号不是管理员。", "error"), 0);
  }
  state.activeRoute = route;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-list a").forEach((link) => link.classList.toggle("active", link.dataset.route === route));
  $(routes[route]).classList.add("active");
  if (route === "detail") {
    renderProductDetail(state.selectedProductId || sessionStorage.getItem(SELECTED_PRODUCT_KEY));
    if (hasAuthenticatedSession() && !state.myProductsLoaded) {
      refreshMyProducts({ quiet: true }).then(() => {
        if (state.activeRoute === "detail") renderProductDetail(state.selectedProductId);
      });
    }
    if (hasAuthenticatedSession() && !state.favoritesLoaded) {
      refreshFavorites({ quiet: true }).then(() => {
        if (state.activeRoute === "detail") renderProductDetail(state.selectedProductId);
      });
    }
    if (hasAuthenticatedSession() && !state.conversationsLoaded) {
      refreshConversations({ quiet: true }).then(() => {
        if (state.activeRoute === "detail") renderProductDetail(state.selectedProductId);
      });
    }
  }
  if (route === "my-products") refreshMyProducts();
  if (route === "my-transactions") refreshTransactions();
  if (route === "my-favorites") refreshFavorites();
  if (route === "messages") refreshConversations();
  if (route === "ai-history") refreshAIHistory();
  if (route === "account-settings") renderAccountSettings();
  if (route === "admin") refreshAdminSection();
  return route;
}

function navigateTo(routeName, { replace = false } = {}) {
  const route = setRoute(routeName);
  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", `#${route}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function bindRouter() {
  const apply = () => {
    const requestedRoute = (location.hash || "#market").slice(1);
    const actualRoute = setRoute(requestedRoute);
    if (actualRoute !== requestedRoute) history.replaceState(null, "", `#${actualRoute}`);
  };
  window.addEventListener("hashchange", apply);
  document.querySelectorAll("a[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      $("myMenu").open = false;
      navigateTo(link.dataset.route);
    });
  });
  apply();
}

function categoryKnowledge(category) {
  return state.categories.find((item) => item.category === category) || state.categories[0];
}

function populateCategorySelects() {
  const options = state.categories.map((item) => `<option>${escapeText(item.category)}</option>`).join("");
  ["categorySelect", "estimateCategory", "authCategory"].forEach((id) => {
    $(id).innerHTML = options;
  });
}

function modelFor(category, text = "") {
  const knowledge = categoryKnowledge(category);
  const lower = text.toLowerCase();
  return (
    knowledge.baselineModels.find((item) => lower.includes(item.model.toLowerCase()) || lower.includes(item.model.split(" ")[0].toLowerCase())) ||
    knowledge.baselineModels[0]
  );
}

function conditionFactor(condition) {
  return { "全新": 1.12, "九成新": 1, "八成新": 0.88, "七成新": 0.74 }[condition] || 0.92;
}

function estimatePriceFrom({ category, model, condition, accessory = "full" }) {
  const knowledge = categoryKnowledge(category);
  const baseline = modelFor(category, model);
  const related = state.transactions.filter((item) => item.category === category || item.model === baseline.model);
  const avgSold = related.reduce((sum, item) => sum + item.price, 0) / Math.max(related.length, 1);
  const accessoryFactor = { full: 1.05, partial: 0.96, none: 0.88 }[accessory] || 1;
  const factor = conditionFactor(condition) * accessoryFactor;
  const l1 = baseline.basePrice * baseline.retention * factor;
  const l2 = avgSold * factor;
  const suggested = l1 * 0.45 + l2 * 0.55;
  return {
    suggested,
    min: suggested * 0.9,
    max: suggested * 1.1,
    baseline,
    related,
    reasons: [
      `L1 基准：${baseline.model}，残值系数 ${baseline.retention}`,
      `L2 近期成交：${related.length} 条样本，均价 ${money(avgSold)}`,
      `成色修正：${condition}，综合系数 ${factor.toFixed(2)}`,
      "建议价用于辅助定价，最终交易仍建议当面验货"
    ]
  };
}

function recognizeFromForm() {
  const category = $("categorySelect").value;
  const name = $("productNameInput").value.trim();
  const brandModel = $("brandModelInput").value.trim();
  const knowledge = categoryKnowledge(category);
  const model = modelFor(category, `${name} ${brandModel}`);
  const brand =
    knowledge.commonBrands.find((item) => brandModel.toLowerCase().includes(item.toLowerCase())) ||
    brandModel.split(/\s+/)[0] ||
    knowledge.commonBrands[0];
  return {
    category,
    brand,
    model: brandModel || model.model,
    condition: $("conditionSelect").value,
    features: knowledge.requiredAttributes.slice(0, 5),
    name: name || brandModel || model.model
  };
}

function buildRawListingInput() {
  return [
    `商品名称：${$("productNameInput").value.trim()}`,
    `品类：${$("categorySelect").value}`,
    `品牌/型号：${$("brandModelInput").value.trim()}`,
    `成色：${$("conditionSelect").value}`,
    `用户补充：${$("rawDescription").value.trim() || "用户未补充细节，请生成简洁可信的发布文案"}`
  ].join("\n");
}

function renderCurrentUser() {
  const loggedIn = hasAuthenticatedSession();
  $("currentUserText").textContent = loggedIn
    ? `${state.currentUser.name} · ${state.currentUser.campus} · 信用 ${state.currentUser.trustScore}`
    : "未登录";
  $("accountAction").textContent = loggedIn ? state.currentUser.name || "账户设置" : "登录";
  $("accountAction").dataset.route = loggedIn ? "account-settings" : "login";
  $("accountAction").setAttribute("href", loggedIn ? "#account-settings" : "#login");
  $("logoutBtn").hidden = !loggedIn;
  $("myProductsNav").hidden = !loggedIn;
  $("myTransactionsNav").hidden = !loggedIn;
  $("myFavoritesNav").hidden = !loggedIn;
  $("messagesNav").hidden = !loggedIn;
  $("aiHistoryNav").hidden = !loggedIn;
  $("adminNav").hidden = !loggedIn || state.currentUser.role !== "admin";
  $("myMenu").hidden = !loggedIn;
  if (loggedIn) $("saveStatus").textContent = `当前卖家：${state.currentUser.name}`;
}

function switchAuthMode(mode) {
  const nextMode = mode === "register" ? "register" : "login";
  state.authMode = nextMode;
  $("loginForm").hidden = nextMode !== "login";
  $("registerForm").hidden = nextMode !== "register";
  $("loginTab").classList.toggle("active", nextMode === "login");
  $("registerTab").classList.toggle("active", nextMode === "register");
  $("loginTab").setAttribute("aria-selected", String(nextMode === "login"));
  $("registerTab").setAttribute("aria-selected", String(nextMode === "register"));
  $("loginStatus").textContent = "";
}

function validateLoginName(value) {
  const loginName = String(value || "").trim();
  if (!/^[A-Za-z0-9_]{4,30}$/.test(loginName)) {
    throw new Error("登录账号必须为 4 至 30 位字母、数字或下划线。");
  }
  return loginName;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 6) throw new Error("密码至少需要 6 个字符。");
  return password;
}

function setAuthSubmitting(mode, submitting) {
  const button = mode === "register" ? $("registerSubmitBtn") : $("loginSubmitBtn");
  button.disabled = submitting;
  button.textContent = submitting ? (mode === "register" ? "正在注册..." : "正在登录...") : mode === "register" ? "注册" : "登录";
}

function clearPasswordFields() {
  ["loginPasswordInput", "registerPasswordInput", "registerConfirmInput"].forEach((id) => {
    $(id).value = "";
    $(id).type = "password";
  });
  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.textContent = "显示";
    button.setAttribute("aria-label", button.getAttribute("aria-label").replace("隐藏", "显示"));
  });
}

async function loginUser(event) {
  event.preventDefault();
  let loginName = "";
  let password = "";
  try {
    loginName = validateLoginName($("loginNameInput").value);
    password = validatePassword($("loginPasswordInput").value);
  } catch (error) {
    $("loginStatus").textContent = error.message;
    return;
  }

  setAuthSubmitting("login", true);
  $("loginStatus").textContent = "正在登录...";
  try {
    const response = await postJson("/api/auth/login", {
      loginName,
      password
    });
    persistSession(response.data);
    renderCurrentUser();
    $("loginStatus").textContent = `登录成功：${state.currentUser.name}`;
    clearPasswordFields();
    setAuthSubmitting("login", false);
    await showSuccessDialog("登录成功");
    navigateTo("publish");
  } catch (error) {
    $("loginStatus").textContent = `登录失败：${apiErrorMessage(error)}`;
  } finally {
    password = "";
    setAuthSubmitting("login", false);
  }
}

async function registerUser(event) {
  event.preventDefault();
  let loginName = "";
  let password = "";
  const name = $("registerNameInput").value.trim();
  const campus = $("registerCampusInput").value.trim();
  try {
    loginName = validateLoginName($("registerLoginNameInput").value);
    password = validatePassword($("registerPasswordInput").value);
    if (!name) throw new Error("昵称不能为空。");
    if (!campus) throw new Error("校区不能为空。");
    if (password !== $("registerConfirmInput").value) throw new Error("两次输入的密码不一致。");
  } catch (error) {
    $("loginStatus").textContent = error.message;
    return;
  }

  setAuthSubmitting("register", true);
  $("loginStatus").textContent = "正在注册...";
  try {
    const response = await postJson("/api/auth/register", { loginName, password, name, campus });
    persistSession(response.data);
    renderCurrentUser();
    $("loginStatus").textContent = `注册成功：${state.currentUser.name}`;
    clearPasswordFields();
    setAuthSubmitting("register", false);
    await showSuccessDialog("注册成功");
    navigateTo("publish");
  } catch (error) {
    $("loginStatus").textContent = `注册失败：${apiErrorMessage(error)}`;
  } finally {
    password = "";
    setAuthSubmitting("register", false);
  }
}

async function logoutUser() {
  const button = $("logoutBtn");
  button.disabled = true;
  button.textContent = "正在退出...";
  $("loginStatus").textContent = "正在退出...";
  let logoutMessage = "已退出登录。";
  try {
    await postJson("/api/auth/logout", {}, authHeaders());
  } catch (error) {
    logoutMessage = `服务暂未响应，本机登录状态已清除：${apiErrorMessage(error)}`;
  } finally {
    clearSession();
    clearPasswordFields();
    renderCurrentUser();
    $("loginStatus").textContent = logoutMessage;
    $("saveStatus").textContent = "请先登录，再发布商品。";
    button.disabled = false;
    button.textContent = "退出登录";
    navigateTo("market");
  }
}

function setMarketStatus(message = "", tone = "") {
  const status = $("marketStatus");
  status.textContent = message;
  status.className = `page-state${tone ? ` ${tone}` : ""}`;
  status.hidden = !message;
}

function openProductDetail(id) {
  state.selectedProductId = String(id || "");
  if (state.selectedProductId) sessionStorage.setItem(SELECTED_PRODUCT_KEY, state.selectedProductId);
  renderProductDetail(state.selectedProductId);
  navigateTo("detail");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待补充";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const PRODUCT_STATUS_LABELS = {
  on_sale: "在售",
  reserved: "已预订",
  sold: "已售出",
  offline: "已下架"
};

const TRANSACTION_STATUS_LABELS = {
  pending: "待确认",
  finished: "已完成",
  cancelled: "已取消"
};

function statusLabel(status, type = "product") {
  return (type === "transaction" ? TRANSACTION_STATUS_LABELS : PRODUCT_STATUS_LABELS)[status] || status || "状态未知";
}

function setWorkspaceStatus(id, message = "", tone = "") {
  const element = $(id);
  element.textContent = message;
  element.className = `page-state${tone ? ` ${tone}` : ""}`;
  element.hidden = !message;
}

function handleExpiredMarketplaceSession(error) {
  if (error?.status !== 401) return false;
  clearSession();
  renderCurrentUser();
  $("loginStatus").textContent = "登录已失效，请重新登录。";
  navigateTo("login");
  return true;
}

function isPasswordRejection(error) {
  return error?.status === 401 && /密码/.test(error.message || "");
}

function openManagedProductDetail(id) {
  const managed = state.myProducts.find((item) => String(item.id) === String(id));
  if (!managed) return;
  state.products = [managed, ...state.products.filter((item) => String(item.id) !== String(id))];
  openProductDetail(id);
}

function renderMyProducts() {
  const filtered = state.myProductFilter === "all"
    ? state.myProducts
    : state.myProducts.filter((item) => item.status === state.myProductFilter);
  $("myProductsEmpty").hidden = filtered.length > 0;
  $("myProductsGrid").innerHTML = filtered
    .map(
      (item) => `
        <article class="managed-product-card" data-id="${escapeText(item.id)}">
          <div class="managed-product-main" role="link" tabindex="0" aria-label="查看 ${escapeText(item.name)} 的详情">
            <img src="${escapeText(item.image || imageFallbackFor(item.category))}" alt="${escapeText(item.name)}" data-fallback="${escapeText(imageFallbackFor(item.category))}">
            <div class="managed-product-copy">
              <div class="managed-product-title">
                <span class="status-badge ${escapeText(item.status)}">${escapeText(statusLabel(item.status))}</span>
                <span>${escapeText(item.category || "其他")}</span>
              </div>
              <h3>${escapeText(item.name)}</h3>
              <p>${escapeText(item.description || "卖家暂未补充商品描述。")}</p>
              <div class="managed-product-meta">
                <strong>${money(item.price)}</strong>
                <span>${escapeText(item.condition || "成色待补充")} · ${escapeText(formatDate(item.createdAt))}</span>
              </div>
            </div>
          </div>
          ${item.status === "on_sale" ? `
            <div class="managed-product-actions">
              <button class="ghost-button" type="button" data-product-action="edit" data-id="${escapeText(item.id)}">编辑</button>
              <button class="danger-button" type="button" data-product-action="offline" data-id="${escapeText(item.id)}">下架</button>
            </div>
          ` : ""}
        </article>
      `
    )
    .join("");

  document.querySelectorAll(".managed-product-card img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });
  document.querySelectorAll(".managed-product-main").forEach((main) => {
    const open = () => openManagedProductDetail(main.closest(".managed-product-card").dataset.id);
    main.addEventListener("click", open);
    main.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
  document.querySelectorAll("[data-product-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.productAction === "edit") openEditProduct(button.dataset.id);
      if (button.dataset.productAction === "offline") takeProductOffline(button.dataset.id, button);
    });
  });
}

async function refreshMyProducts({ quiet = false } = {}) {
  if (!hasAuthenticatedSession()) return false;
  if (!quiet) setWorkspaceStatus("myProductsStatus", "正在加载我的商品...", "loading");
  try {
    const response = await getJson("/api/my/products", authHeaders());
    state.myProducts = Array.isArray(response.data) ? response.data : [];
    state.myProductsLoaded = true;
    state.myProductsError = "";
    setWorkspaceStatus("myProductsStatus");
    renderMyProducts();
    return true;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return false;
    state.myProducts = [];
    state.myProductsLoaded = false;
    state.myProductsError = marketplaceErrorMessage(error, "我的商品加载失败，请稍后重试。");
    renderMyProducts();
    if (!quiet || state.activeRoute === "my-products") setWorkspaceStatus("myProductsStatus", state.myProductsError, "error");
    return false;
  }
}

function openEditProduct(id) {
  const product = state.myProducts.find((item) => String(item.id) === String(id));
  if (!product || product.status !== "on_sale") {
    setWorkspaceStatus("myProductsStatus", "当前状态不能编辑，正在刷新商品列表。", "warning");
    refreshMyProducts({ quiet: true });
    return;
  }
  state.editingProductId = product.id;
  $("editProductName").value = product.name || "";
  $("editProductDescription").value = product.description || "";
  $("editProductPrice").value = Number(product.price) || "";
  $("editProductStatus").textContent = "";
  $("editProductDialog").showModal();
}

async function submitProductEdit(event) {
  event.preventDefault();
  const name = $("editProductName").value.trim();
  const description = $("editProductDescription").value.trim();
  const price = Number($("editProductPrice").value);
  if (!name) {
    $("editProductStatus").textContent = "商品名称不能为空。";
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    $("editProductStatus").textContent = "商品价格必须大于 0。";
    return;
  }

  const button = $("editProductSubmit");
  button.disabled = true;
  button.textContent = "正在保存...";
  $("editProductStatus").textContent = "正在提交修改...";
  try {
    await patchJson(`/api/my/products/${encodeURIComponent(state.editingProductId)}`, { name, description, price }, authHeaders());
    $("editProductDialog").close();
    await Promise.all([refreshMyProducts(), refreshProducts()]);
    await showSuccessDialog("修改成功");
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) {
      $("editProductDialog").close();
      return;
    }
    if (error?.status === 409) {
      $("editProductStatus").textContent = "当前状态不能编辑，商品列表已刷新。";
      await refreshMyProducts({ quiet: true });
    } else {
      $("editProductStatus").textContent = marketplaceErrorMessage(error, "修改失败，请稍后重试。");
    }
  } finally {
    button.disabled = false;
    button.textContent = "保存修改";
  }
}

async function takeProductOffline(id, button) {
  const product = state.myProducts.find((item) => String(item.id) === String(id));
  if (!product) return;
  const confirmed = await showConfirmDialog(`确认下架“${product.name}”吗？下架后将不能继续被预订。`, "确认下架");
  if (!confirmed) return;
  button.disabled = true;
  button.textContent = "正在下架...";
  try {
    await postJson(`/api/my/products/${encodeURIComponent(id)}/off-shelf`, {}, authHeaders());
    await Promise.all([refreshMyProducts(), refreshProducts()]);
    await showSuccessDialog("下架成功");
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    setWorkspaceStatus("myProductsStatus", marketplaceErrorMessage(error, "下架失败，请稍后重试。"), error?.status === 409 ? "warning" : "error");
    if (error?.status === 409) await refreshMyProducts({ quiet: true });
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "下架";
    }
  }
}

function renderTransactions() {
  const filtered = state.tradeRecords.filter((item) => item.role === state.transactionRole);
  $("transactionsEmpty").hidden = filtered.length > 0;
  $("transactionsList").innerHTML = filtered
    .map((item) => {
      const counterpart = item.role === "buyer" ? item.seller : item.buyer;
      const actions = item.status === "pending"
        ? `${item.role === "seller" ? `<button type="button" data-transaction-action="finish" data-id="${escapeText(item.id)}">确认完成</button>` : ""}
           <button class="danger-button" type="button" data-transaction-action="cancel" data-id="${escapeText(item.id)}">取消交易</button>`
        : "";
      return `
        <article class="transaction-card">
          <img src="${escapeText(item.productImage || imageFallbackFor("交易商品"))}" alt="${escapeText(item.productName)}" data-fallback="${escapeText(imageFallbackFor("交易商品"))}">
          <div class="transaction-copy">
            <div class="transaction-title-row">
              <span class="status-badge ${escapeText(item.status)}">${escapeText(statusLabel(item.status, "transaction"))}</span>
              <span>${item.role === "buyer" ? "买入" : "卖出"}</span>
            </div>
            <h3>${escapeText(item.productName)}</h3>
            <p>交易对象：${escapeText(counterpart?.name || "校园同学")} · 创建于 ${escapeText(formatDate(item.createdAt))}</p>
            <strong>${money(item.finalPrice)}</strong>
          </div>
          ${actions ? `<div class="transaction-actions">${actions}</div>` : ""}
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".transaction-card img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });
  document.querySelectorAll("[data-transaction-action]").forEach((button) => {
    button.addEventListener("click", () => updateTransaction(button.dataset.id, button.dataset.transactionAction, button));
  });
}

async function refreshTransactions({ quiet = false } = {}) {
  if (!hasAuthenticatedSession()) return false;
  if (!quiet) setWorkspaceStatus("transactionsStatus", "正在加载我的交易...", "loading");
  try {
    const response = await getJson("/api/my/transactions", authHeaders());
    state.tradeRecords = Array.isArray(response.data) ? response.data : [];
    state.transactionsLoaded = true;
    state.transactionsError = "";
    setWorkspaceStatus("transactionsStatus");
    renderTransactions();
    return true;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return false;
    state.tradeRecords = [];
    state.transactionsLoaded = false;
    state.transactionsError = marketplaceErrorMessage(error, "我的交易加载失败，请稍后重试。");
    renderTransactions();
    if (!quiet || state.activeRoute === "my-transactions") setWorkspaceStatus("transactionsStatus", state.transactionsError, "error");
    return false;
  }
}

async function updateTransaction(id, action, button) {
  const transaction = state.tradeRecords.find((item) => String(item.id) === String(id));
  if (!transaction) return;
  const finishing = action === "finish";
  const confirmed = await showConfirmDialog(
    finishing ? `确认“${transaction.productName}”已经完成交易吗？` : `确认取消“${transaction.productName}”的待处理交易吗？`,
    finishing ? "确认完成" : "确认取消"
  );
  if (!confirmed) return;
  button.disabled = true;
  button.textContent = finishing ? "正在确认..." : "正在取消...";
  try {
    await postJson(`/api/transactions/${encodeURIComponent(id)}/${finishing ? "finish" : "cancel"}`, {}, authHeaders());
    await Promise.all([refreshTransactions(), refreshMyProducts({ quiet: true }), refreshProducts()]);
    await showSuccessDialog(finishing ? "交易已完成" : "交易已取消");
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    setWorkspaceStatus("transactionsStatus", marketplaceErrorMessage(error, "交易操作失败，请稍后重试。"), error?.status === 409 ? "warning" : "error");
    if (error?.status === 409) await refreshTransactions({ quiet: true });
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = finishing ? "确认完成" : "取消交易";
    }
  }
}

async function reserveProduct(id, button) {
  if (!hasAuthenticatedSession()) {
    $("loginStatus").textContent = "请先登录，再预订商品。";
    navigateTo("login");
    return;
  }
  const product = state.products.find((item) => String(item.id) === String(id));
  if (!product) return;
  const confirmed = await showConfirmDialog(`确认预订“${product.name}”吗？预订价格以当前商品售价为准。`, "确认预订");
  if (!confirmed) return;
  button.disabled = true;
  button.textContent = "正在预订...";
  try {
    await postJson(`/api/products/${encodeURIComponent(id)}/reserve`, {}, authHeaders());
    await Promise.all([refreshProducts(), refreshTransactions({ quiet: true }), refreshMyProducts({ quiet: true })]);
    await showSuccessDialog("预订成功");
    state.transactionRole = "buyer";
    updateTransactionTabs();
    navigateTo("my-transactions");
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    setWorkspaceStatus("detailStatus", marketplaceErrorMessage(error, "预订失败，请稍后重试。"), error?.status === 409 ? "warning" : "error");
    if (error?.status === 409) await refreshProducts();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = "立即预订";
    }
  }
}

function updateTransactionTabs() {
  document.querySelectorAll("[data-transaction-role]").forEach((button) => {
    const active = button.dataset.transactionRole === state.transactionRole;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderTransactions();
}

function isFavorite(productId) {
  return state.favorites.some((item) => String(item.id) === String(productId));
}

function renderFavorites() {
  const favorites = state.favorites;
  $("favoritesEmpty").hidden = favorites.length > 0;
  $("favoritesGrid").innerHTML = favorites.map((item) => `
    <article class="favorite-card">
      <img src="${escapeText(item.image || imageFallbackFor(item.category))}" alt="${escapeText(item.name)}" data-fallback="${escapeText(imageFallbackFor(item.category))}">
      <div class="favorite-copy">
        <div class="favorite-heading">
          <span class="status-badge ${escapeText(item.status)}">${escapeText(statusLabel(item.status))}</span>
          <span>收藏于 ${escapeText(formatDate(item.favoritedAt))}</span>
        </div>
        <h3>${escapeText(item.name)}</h3>
        <strong>${money(item.price)}</strong>
        <p>${escapeText(item.condition || "成色待补充")} · ${escapeText(item.sellerName || "校园同学")} · ${escapeText(item.campus || "校内")}</p>
      </div>
      <div class="favorite-actions">
        <button class="ghost-button" type="button" data-favorite-view="${escapeText(item.id)}">查看详情</button>
        <button class="danger-button" type="button" data-favorite-remove="${escapeText(item.id)}">取消收藏</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".favorite-card img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });
  document.querySelectorAll("[data-favorite-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = state.favorites.find((item) => String(item.id) === button.dataset.favoriteView);
      if (product) state.products = [product, ...state.products.filter((item) => String(item.id) !== String(product.id))];
      openProductDetail(button.dataset.favoriteView);
    });
  });
  document.querySelectorAll("[data-favorite-remove]").forEach((button) => {
    button.addEventListener("click", () => toggleFavorite(button.dataset.favoriteRemove, button));
  });
}

async function refreshFavorites({ quiet = false } = {}) {
  if (!hasAuthenticatedSession()) return false;
  if (!quiet) setWorkspaceStatus("favoritesStatus", "正在加载我的收藏...", "loading");
  try {
    const response = await getJson("/api/my/favorites", authHeaders());
    state.favorites = Array.isArray(response.data) ? response.data : [];
    state.favoritesLoaded = true;
    state.favoritesError = "";
    setWorkspaceStatus("favoritesStatus");
    renderFavorites();
    return true;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return false;
    state.favorites = [];
    state.favoritesLoaded = false;
    state.favoritesError = marketplaceErrorMessage(error, "收藏列表加载失败，请稍后重试。");
    renderFavorites();
    if (!quiet || state.activeRoute === "my-favorites") setWorkspaceStatus("favoritesStatus", state.favoritesError, "error");
    return false;
  }
}

async function toggleFavorite(productId, button) {
  if (!hasAuthenticatedSession()) {
    $("loginStatus").textContent = "请先登录，再收藏商品。";
    navigateTo("login");
    return;
  }
  const removing = isFavorite(productId);
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "处理中...";
  try {
    if (removing) await deleteJson(`/api/products/${encodeURIComponent(productId)}/favorite`, authHeaders());
    else await postJson(`/api/products/${encodeURIComponent(productId)}/favorite`, {}, authHeaders());
    await refreshFavorites({ quiet: true });
    if (state.activeRoute === "detail") renderProductDetail(productId);
    if (state.activeRoute === "my-favorites") setWorkspaceStatus("favoritesStatus", removing ? "已取消收藏。" : "收藏成功。", "success");
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    const statusId = state.activeRoute === "my-favorites" ? "favoritesStatus" : "detailStatus";
    setWorkspaceStatus(statusId, marketplaceErrorMessage(error, removing ? "取消收藏失败，请稍后重试。" : "收藏失败，请稍后重试。"), "error");
    if (error?.status === 409 || error?.status === 404) await refreshFavorites({ quiet: true });
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function conversationKey(item) {
  return `${item?.productId || ""}:${item?.peerId || ""}`;
}

function visibleConversations() {
  const conversations = [...state.conversations];
  if (state.pendingConversation && !conversations.some((item) => conversationKey(item) === conversationKey(state.pendingConversation))) {
    conversations.unshift(state.pendingConversation);
  }
  return conversations;
}

function renderConversations() {
  const conversations = visibleConversations();
  $("messagesWorkspace").hidden = false;
  $("conversationCount").textContent = `${conversations.length} 个会话`;
  $("conversationEmpty").hidden = conversations.length > 0;
  $("conversationList").innerHTML = conversations.map((item) => {
    const active = conversationKey(item) === conversationKey(state.activeConversation);
    return `
      <button class="conversation-item${active ? " active" : ""}" type="button" data-conversation-key="${escapeText(conversationKey(item))}">
        <img src="${escapeText(item.productImage || imageFallbackFor("消息商品"))}" alt="${escapeText(item.productName || "商品")}" data-fallback="${escapeText(imageFallbackFor("消息商品"))}">
        <span class="conversation-copy">
          <span class="conversation-title"><strong>${escapeText(item.productName || "商品")}</strong>${Number(item.unreadCount || 0) ? `<b>${Number(item.unreadCount)}</b>` : ""}</span>
          <span>${escapeText(item.peerName || "校园同学")}</span>
          <small>${escapeText(item.lastMessage || "开始一段关于商品的对话")}</small>
        </span>
      </button>
    `;
  }).join("");
  document.querySelectorAll(".conversation-item img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });
  document.querySelectorAll("[data-conversation-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const conversation = visibleConversations().find((item) => conversationKey(item) === button.dataset.conversationKey);
      if (conversation) selectConversation(conversation);
    });
  });
  renderMessageThread();
}

function renderMessageThread() {
  const active = state.activeConversation;
  $("messageThreadEmpty").hidden = Boolean(active);
  $("activeMessageThread").hidden = !active;
  $("messagesWorkspace").classList.toggle("thread-open", state.mobileThreadOpen && Boolean(active));
  if (!active) return;
  $("messagePeerName").textContent = active.peerName || "校园同学";
  $("messageProductName").textContent = active.productName || "商品";
  $("messageProductImage").src = active.productImage || imageFallbackFor("消息商品");
  $("messageProductImage").onerror = () => { $("messageProductImage").src = imageFallbackFor("消息商品"); };
  if (state.messageThreadLoading) {
    $("messageList").innerHTML = '<div class="message-thread-notice">正在加载消息...</div>';
    return;
  }
  if (!state.activeMessages.length) {
    $("messageList").innerHTML = '<div class="message-thread-notice">还没有消息，发一条友好的问候吧。</div>';
    return;
  }
  $("messageList").innerHTML = state.activeMessages.map((message) => {
    const mine = String(message.senderId) === String(state.currentUser.id);
    return `
      <div class="message-bubble-row ${mine ? "mine" : "peer"}">
        <div class="message-bubble">
          <span>${escapeText(mine ? "我" : (message.senderName || active.peerName || "对方"))}</span>
          <p>${escapeText(message.content)}</p>
          <time>${escapeText(formatDate(message.createdAt))}${mine ? (message.isRead ? " · 已读" : " · 已发送") : ""}</time>
        </div>
      </div>
    `;
  }).join("");
  $("messageList").scrollTop = $("messageList").scrollHeight;
}

async function refreshConversations({ quiet = false } = {}) {
  if (!hasAuthenticatedSession()) return false;
  if (!quiet) setWorkspaceStatus("messagesStatus", "正在加载会话...", "loading");
  try {
    const response = await getJson("/api/my/conversations", authHeaders());
    state.conversations = Array.isArray(response.data) ? response.data : [];
    state.conversationsLoaded = true;
    state.conversationsError = "";
    setWorkspaceStatus("messagesStatus");
    if (state.activeConversation) {
      state.activeConversation = visibleConversations().find((item) => conversationKey(item) === conversationKey(state.activeConversation)) || state.activeConversation;
    }
    renderConversations();
    return true;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return false;
    state.conversations = [];
    state.conversationsLoaded = false;
    state.conversationsError = marketplaceErrorMessage(error, "会话列表加载失败，请稍后重试。");
    $("messagesWorkspace").hidden = true;
    if (!quiet || state.activeRoute === "messages") setWorkspaceStatus("messagesStatus", state.conversationsError, "error");
    return false;
  }
}

async function selectConversation(conversation) {
  state.activeConversation = conversation;
  state.activeMessages = [];
  state.messageThreadLoading = true;
  state.mobileThreadOpen = true;
  $("messageSendStatus").textContent = "";
  renderConversations();
  try {
    const query = new URLSearchParams({ productId: conversation.productId, peerId: conversation.peerId });
    const response = await getJson(`/api/messages?${query}`, authHeaders());
    state.activeMessages = Array.isArray(response.data) ? response.data : [];
    const unread = state.activeMessages.filter((message) => !message.isRead && String(message.receiverId) === String(state.currentUser.id));
    const results = await Promise.allSettled(unread.map((message) => patchJson(`/api/messages/${encodeURIComponent(message.id)}/read`, {}, authHeaders())));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") unread[index].isRead = true;
    });
    const stored = state.conversations.find((item) => conversationKey(item) === conversationKey(conversation));
    if (stored) stored.unreadCount = 0;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    $("messageSendStatus").textContent = marketplaceErrorMessage(error, "消息加载失败，请稍后重试。");
  } finally {
    state.messageThreadLoading = false;
    renderConversations();
  }
}

function contactSeller(product) {
  if (!hasAuthenticatedSession()) {
    $("loginStatus").textContent = "请先登录，再联系卖家。";
    navigateTo("login");
    return;
  }
  const existing = state.conversations.find((item) => String(item.productId) === String(product.id));
  const peerId = product.sellerId || existing?.peerId;
  if (!peerId) {
    setWorkspaceStatus("detailStatus", "暂时无法联系卖家，请稍后重试。", "error");
    return;
  }
  if (String(peerId) === String(state.currentUser.id)) {
    setWorkspaceStatus("detailStatus", "不能给自己发布的商品发送消息。", "warning");
    return;
  }
  state.pendingConversation = existing || {
    id: `${product.id}:${peerId}`,
    productId: product.id,
    productName: product.name,
    productImage: product.image || "",
    peerId,
    peerName: product.sellerName || "卖家",
    lastMessage: "",
    unreadCount: 0
  };
  state.activeConversation = state.pendingConversation;
  state.mobileThreadOpen = true;
  navigateTo("messages");
  selectConversation(state.pendingConversation);
}

async function sendMessage(event) {
  event.preventDefault();
  if (state.messageSending || !state.activeConversation) return;
  const content = $("messageInput").value.trim();
  if (!content) {
    $("messageSendStatus").textContent = "消息不能为空。";
    return;
  }
  if (content.length > 1000) {
    $("messageSendStatus").textContent = "消息不能超过 1000 个字符。";
    return;
  }
  state.messageSending = true;
  $("messageSendBtn").disabled = true;
  $("messageSendBtn").textContent = "发送中...";
  $("messageSendStatus").textContent = "正在发送...";
  try {
    const response = await postJson("/api/messages", {
      productId: state.activeConversation.productId,
      receiverId: state.activeConversation.peerId,
      content
    }, authHeaders());
    state.activeMessages.push(response.data);
    $("messageInput").value = "";
    $("messageInputCount").textContent = "0 / 1000";
    $("messageSendStatus").textContent = "发送成功。";
    state.pendingConversation = null;
    renderMessageThread();
    await refreshConversations({ quiet: true });
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return;
    $("messageSendStatus").textContent = marketplaceErrorMessage(error, "发送失败，请稍后重试。");
  } finally {
    state.messageSending = false;
    $("messageSendBtn").disabled = false;
    $("messageSendBtn").textContent = "发送";
  }
}

function providerLabel(provider) {
  if (provider === "deepseek") return "DeepSeek";
  if (provider === "local-fallback") return "本地回退";
  return provider || "未知来源";
}

function riskLevelLabel(level) {
  return { low: "低风险", medium: "中等风险", high: "高风险" }[level] || level || "待判断";
}

function renderAIHistory() {
  $("aiHistoryEmpty").hidden = state.aiReports.length > 0;
  $("aiHistoryList").innerHTML = state.aiReports.map((report) => {
    const result = report.result || {};
    const priceSummary = report.type === "price"
      ? `<div class="ai-report-metrics"><div><span>建议价</span><strong>${money(result.suggested)}</strong></div><div><span>价格区间</span><strong>${money(result.min)} - ${money(result.max)}</strong></div></div>`
      : `<div class="ai-report-metrics"><div><span>风险等级</span><strong>${escapeText(riskLevelLabel(result.riskLevel))}</strong></div><div><span>结论</span><strong>${escapeText(result.verdict || "暂无结论")}</strong></div></div>`;
    const suggestions = report.type === "price" ? result.reasons : result.findings;
    return `
      <article class="ai-report-card">
        <header>
          <div><span class="ai-report-type ${escapeText(report.type)}">${report.type === "price" ? "智能估价" : "风险评估"}</span><span class="provider-badge ${report.provider === "deepseek" ? "deepseek" : "fallback"}">${escapeText(providerLabel(report.provider))}</span></div>
          <time>${escapeText(formatDate(report.createdAt))}</time>
        </header>
        <div class="ai-report-title"><div><span>${escapeText(report.productName || "未关联具体商品")}</span><strong>${report.score == null ? "暂无评分" : `${Math.round(Number(report.score))} 分`}</strong></div></div>
        ${priceSummary}
        ${Array.isArray(suggestions) && suggestions.length ? `<ul>${suggestions.slice(0, 3).map((item) => `<li>${escapeText(item)}</li>`).join("")}</ul>` : ""}
        <details><summary>展开完整结果</summary><pre>${escapeText(JSON.stringify(result, null, 2))}</pre></details>
      </article>
    `;
  }).join("");
}

async function refreshAIHistory({ quiet = false } = {}) {
  if (!hasAuthenticatedSession()) return false;
  if (!quiet) setWorkspaceStatus("aiHistoryStatus", "正在加载 AI 记录...", "loading");
  try {
    const response = await getJson(`/api/my/ai-reports?type=${encodeURIComponent(state.aiReportType)}`, authHeaders());
    state.aiReports = Array.isArray(response.data) ? response.data : [];
    state.aiReportsLoaded = true;
    state.aiReportsError = "";
    setWorkspaceStatus("aiHistoryStatus");
    renderAIHistory();
    return true;
  } catch (error) {
    if (handleExpiredMarketplaceSession(error)) return false;
    state.aiReports = [];
    state.aiReportsLoaded = false;
    state.aiReportsError = marketplaceErrorMessage(error, "AI 历史加载失败，请稍后重试。");
    renderAIHistory();
    if (!quiet || state.activeRoute === "ai-history") setWorkspaceStatus("aiHistoryStatus", state.aiReportsError, "error");
    return false;
  }
}

function renderProductDetail(id) {
  const status = $("detailStatus");
  const content = $("detailContent");
  const publicProduct = state.products.find((item) => String(item.id) === String(id || ""));
  const managedProduct = state.myProducts.find((item) => String(item.id) === String(id || ""));
  const product = managedProduct ? { ...publicProduct, ...managedProduct } : publicProduct;
  if (!product) {
    content.hidden = true;
    content.innerHTML = "";
    status.hidden = false;
    status.className = "page-state error";
    status.textContent = id ? "商品不存在或已经下架，请返回首页重新选择。" : "尚未选择商品，请返回首页浏览商品。";
    return;
  }

  const discount = discountText(product);
  const originalPrice = Number(product.originalPrice);
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const productStatus = managedProduct?.status || product.status || "on_sale";
  const isOwnProduct = Boolean(managedProduct);
  let tradeControl = "";
  if (!hasAuthenticatedSession()) {
    tradeControl = productStatus === "on_sale"
      ? '<button id="detailLoginToReserve" type="button">登录后预订</button>'
      : `<p class="detail-trade-note">商品当前状态为“${escapeText(statusLabel(productStatus))}”，暂不可预订。</p>`;
  } else if (!state.myProductsLoaded && !state.myProductsError) {
    tradeControl = '<button type="button" disabled>正在确认商品权限...</button>';
  } else if (state.myProductsError) {
    tradeControl = '<p class="detail-trade-note error">暂时无法确认商品权限，请稍后刷新重试。</p>';
  } else if (isOwnProduct) {
    tradeControl = '<p class="detail-trade-note own">这是你发布的商品，不能预订自己的商品。</p>';
  } else if (productStatus === "on_sale") {
    tradeControl = `<button id="reserveProductBtn" type="button" data-reserve-id="${escapeText(product.id)}">立即预订</button>`;
  } else {
    tradeControl = `<p class="detail-trade-note">商品当前状态为“${escapeText(statusLabel(productStatus))}”，暂不可预订。</p>`;
  }
  let favoriteControl = "";
  if (!hasAuthenticatedSession()) {
    favoriteControl = '<button id="detailLoginToFavorite" class="ghost-button" type="button">收藏</button>';
  } else if (!state.myProductsLoaded || !state.favoritesLoaded) {
    favoriteControl = '<button class="ghost-button" type="button" disabled>正在确认收藏状态...</button>';
  } else if (isOwnProduct) {
    favoriteControl = '<button class="ghost-button" type="button" disabled title="不能收藏自己的商品">自己的商品</button>';
  } else {
    const favorited = isFavorite(product.id);
    favoriteControl = `<button id="favoriteProductBtn" class="ghost-button${favorited ? " selected" : ""}" type="button" data-favorite-id="${escapeText(product.id)}">${favorited ? "取消收藏" : "收藏"}</button>`;
  }
  let contactControl = "";
  if (!hasAuthenticatedSession()) {
    contactControl = '<button id="detailLoginToMessage" class="ghost-button" type="button">联系卖家</button>';
  } else if (!state.myProductsLoaded) {
    contactControl = '<button class="ghost-button" type="button" disabled>正在确认卖家...</button>';
  } else if (isOwnProduct) {
    contactControl = '<button class="ghost-button" type="button" disabled title="不能联系自己">这是我的商品</button>';
  } else {
    contactControl = `<button id="contactSellerBtn" class="ghost-button" type="button" data-contact-id="${escapeText(product.id)}">联系卖家</button>`;
  }
  status.hidden = true;
  content.hidden = false;
  content.innerHTML = `
    <div class="detail-media">
      <img id="detailImage" src="${escapeText(product.image || imageFallbackFor(product.category))}" alt="${escapeText(product.name)}" data-fallback="${escapeText(imageFallbackFor(product.category))}">
    </div>
    <div class="detail-panel">
      <div class="detail-heading">
        <p class="kicker">${escapeText(product.category || "校园好物")}</p>
        <h2>${escapeText(product.name)}</h2>
        <div class="detail-price-row">
          <strong>${money(product.price)}</strong>
          ${Number.isFinite(originalPrice) && originalPrice > Number(product.price) ? `<del>${money(originalPrice)}</del>` : ""}
          ${discount ? `<span>${escapeText(discount)}</span>` : ""}
        </div>
      </div>
      <div class="detail-facts">
        <div><span>成色</span><strong>${escapeText(product.condition || "待补充")}</strong></div>
        <div><span>状态</span><strong>${escapeText(statusLabel(productStatus))}</strong></div>
        <div><span>信用分</span><strong>${productTrust(product)}</strong></div>
        <div><span>浏览量</span><strong>${Number(product.views || 0)} 次</strong></div>
        <div><span>发布时间</span><strong>${escapeText(formatDate(product.createdAt))}</strong></div>
      </div>
      <section class="detail-description">
        <h3>商品描述</h3>
        <p>${escapeText(product.description || `${product.condition || "该商品"}，卖家暂未补充更多描述，建议当面验货确认。`)}</p>
      </section>
      <div class="chip-row detail-tags">${tags.length ? tags.map((tag) => `<span>${escapeText(tag)}</span>`).join("") : "<span>暂无标签</span>"}</div>
      <section class="seller-card">
        <div>
          <span>卖家</span>
          <strong>${escapeText(product.sellerName || "校园同学")}</strong>
        </div>
        <div>
          <span>校区</span>
          <strong>${escapeText(product.campus || "校内")}</strong>
        </div>
      </section>
      <div class="detail-actions" aria-label="商品操作">
        ${favoriteControl}
        ${contactControl}
        ${tradeControl}
      </div>
    </div>
  `;
  const image = $("detailImage");
  image.addEventListener("error", () => {
    if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
  });
  $("reserveProductBtn")?.addEventListener("click", (event) => reserveProduct(event.currentTarget.dataset.reserveId, event.currentTarget));
  $("favoriteProductBtn")?.addEventListener("click", (event) => toggleFavorite(event.currentTarget.dataset.favoriteId, event.currentTarget));
  $("contactSellerBtn")?.addEventListener("click", () => contactSeller(product));
  $("detailLoginToFavorite")?.addEventListener("click", () => {
    $("loginStatus").textContent = "请先登录，再收藏商品。";
    navigateTo("login");
  });
  $("detailLoginToMessage")?.addEventListener("click", () => {
    $("loginStatus").textContent = "请先登录，再联系卖家。";
    navigateTo("login");
  });
  $("detailLoginToReserve")?.addEventListener("click", () => {
    $("loginStatus").textContent = "请先登录，再预订商品。";
    navigateTo("login");
  });
}

function renderMarketProducts(category = "all") {
  const products = category === "all" ? state.products : state.products.filter((item) => item.category === category);
  if (!products.length) {
    $("marketGrid").innerHTML = "";
    setMarketStatus(state.marketError || (category === "all" ? "暂时没有商品，稍后再来看看。" : "该分类暂时没有商品。"), state.marketError ? "error" : "empty");
    return;
  }
  setMarketStatus(state.marketError, state.marketError ? "warning" : "");
  $("marketGrid").innerHTML = products
    .map(
      (item) => {
        const discount = discountText(item);
        return `
        <article class="market-card" data-id="${escapeText(item.id)}" role="link" tabindex="0" aria-label="查看 ${escapeText(item.name)} 的详情">
          <img src="${escapeText(item.image || imageFallbackFor(item.category))}" alt="${escapeText(item.name)}" data-fallback="${escapeText(imageFallbackFor(item.category))}">
          <div class="market-card-body">
            <div class="market-card-meta">
              <span>${escapeText(item.category)}</span>
              <strong>${money(item.price)}</strong>
            </div>
            <h3>${escapeText(item.name)}</h3>
            <p class="market-card-desc">${escapeText(item.description || `${item.condition}，支持校内当面验货。`)}</p>
            <div class="product-proof">
              <span>${escapeText(item.condition)}</span>
              <span>信用 ${productTrust(item)}</span>
              ${discount ? `<span>${escapeText(discount)}</span>` : ""}
            </div>
            <p class="seller-line">${escapeText(item.sellerName || "同学")} · ${escapeText(item.campus || "校内")} · ${Number(item.views || 0)} 次浏览</p>
            <div class="chip-row">${(item.tags || []).slice(0, 3).map((tag) => `<span>${escapeText(tag)}</span>`).join("")}</div>
          </div>
        </article>
      `;
      }
    )
    .join("");

  document.querySelectorAll(".market-card img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });

  document.querySelectorAll(".market-card").forEach((card) => {
    card.addEventListener("click", () => openProductDetail(card.dataset.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProductDetail(card.dataset.id);
      }
    });
  });
}

async function refreshProducts() {
  setMarketStatus("正在加载商品...", "loading");
  try {
    const response = await getJson("/api/products");
    state.marketError = "";
    state.products = mergeProducts(response.data || []);
  } catch (error) {
    state.marketError = apiErrorMessage(error, "商品加载失败，请稍后重试。");
    state.products = mergeProducts([]);
  }
  renderMarketProducts(document.querySelector(".tab-button.active")?.dataset.filter || "all");
  renderSearchResults(state.products.slice(0, 4));
}

function renderRecognition(result) {
  $("recognitionResult").innerHTML = [
    `品类：${result.category}`,
    `品牌：${result.brand}`,
    `型号：${result.model}`,
    `成色：${result.condition}`,
    ...result.features
  ]
    .map((item) => `<span>${escapeText(item)}</span>`)
    .join("");
}

function renderPrice(price) {
  $("suggestedPrice").textContent = money(price.suggested);
  $("priceRange").textContent = `${money(price.min)} - ${money(price.max)}`;
  if (!state.sellerPriceTouched || !$("sellerPriceInput").value) {
    $("sellerPriceInput").value = Math.round(price.suggested);
  }
  $("priceReason").innerHTML = price.reasons.map((item) => `<div>${escapeText(item)}</div>`).join("");
}

async function renderEstimate() {
  const localPrice = estimatePriceFrom({
    category: $("estimateCategory").value,
    model: $("estimateModel").value,
    condition: $("estimateCondition").value,
    accessory: $("estimateAccessory").value
  });
  $("estimatePrice").textContent = "AI 分析中...";
  try {
    const response = await postJson("/api/ai/estimate", {
      category: $("estimateCategory").value,
      model: $("estimateModel").value.trim(),
      condition: $("estimateCondition").value,
      accessory: $("estimateAccessory").value,
      userExternalId: state.currentUser?.id || null,
      localEstimate: localPrice
    }, authHeaders());
    const price = response.data || localPrice;
    $("estimatePrice").textContent = money(price.suggested);
    $("estimateRange").textContent = `建议区间 ${money(price.min)} - ${money(price.max)} · ${price.provider === "deepseek" ? "DeepSeek AI" : "本地模型"}`;
    $("estimateReasons").innerHTML = (price.reasons || localPrice.reasons).map((item) => `<div>${escapeText(item)}</div>`).join("");
  } catch (error) {
    $("estimatePrice").textContent = money(localPrice.suggested);
    $("estimateRange").textContent = `建议区间 ${money(localPrice.min)} - ${money(localPrice.max)} · 本地模型`;
    $("estimateReasons").innerHTML = [...localPrice.reasons, apiErrorMessage(error, "AI 暂不可用，已使用本地估价。")].map((item) => `<div>${escapeText(item)}</div>`).join("");
  }
}

function runRiskCheck(listing, price) {
  const text = `${listing?.title || ""} ${listing?.description || ""} ${$("rawDescription").value}`;
  const listedPrice = Number($("sellerPriceInput").value) || price?.suggested || 0;
  const findings = [];

  state.risks.forEach((rule) => {
    if (rule.type === "text" && rule.keywords.some((keyword) => text.includes(keyword))) findings.push(rule);
    if (rule.type === "account" && $("accountSelect").value === "new") findings.push(rule);
    if (rule.type === "price" && price) {
      const ratio = listedPrice / Math.max(price.suggested, 1);
      if (rule.name === "异常低价" && ratio < rule.threshold) findings.push(rule);
      if (rule.name === "异常高价" && ratio > rule.threshold) findings.push(rule);
    }
  });

  if (!findings.length) {
    findings.push({ level: "low", name: "基础检测通过", message: "未命中明显异常价格、站外交易或新号高风险提示。" });
  }

  $("riskBox").innerHTML = findings.map((item) => `<div><strong>${escapeText(item.name)}</strong><span>${escapeText(item.message)}</span></div>`).join("");
}

function fallbackListing(input) {
  const condition = input.condition || "九成新";
  const brand = input.brand || "同学自用";
  const model = input.model || input.name || "二手好物";
  return {
    title: `${condition}${brand}${model}｜支持当面验货`,
    description: `这是一件${condition}的${brand}${model}，适合同校自提。建议买家当面检查外观、功能和配件，确认无误后交易。`,
    sellingPoints: ["同校交易", "可当面验货", "价格参考透明", "AI 辅助发布"]
  };
}

async function generateListing() {
  $("generateBtn").disabled = true;
  $("generateBtn").textContent = "生成中";
  try {
    const rawInput = buildRawListingInput();
    let extracted = {};
    try {
      const extract = await postJson("/api/extract-attributes", { rawText: rawInput });
      extracted = extract.data || {};
    } catch {
      extracted = {};
    }

    state.recognition = { ...recognizeFromForm(), ...extracted, category: $("categorySelect").value, condition: $("conditionSelect").value };
    renderRecognition(state.recognition);

    let listingResponse = null;
    try {
      listingResponse = await postJson("/api/generate-listing", {
        ...state.recognition,
        userDescription: $("rawDescription").value.trim(),
        rawInput
      });
    } catch {
      listingResponse = { data: fallbackListing(state.recognition), deepSeekEnabled: false };
    }

    state.listing = listingResponse.data || fallbackListing(state.recognition);
    $("listingTitle").textContent = state.listing.title;
    $("listingDescription").textContent = state.listing.description;
    state.latestPrice = estimatePriceFrom(state.recognition);
    renderPrice(state.latestPrice);
    runRiskCheck(state.listing, state.latestPrice);
  } finally {
    $("generateBtn").disabled = false;
    $("generateBtn").textContent = "生成文案";
  }
}

async function saveCurrentProduct() {
  if (!hasAuthenticatedSession()) {
    $("saveStatus").textContent = "请先登录，再发布商品。";
    navigateTo("login");
    return;
  }
  if (!state.recognition || !state.listing) await generateListing();

  $("publishProductBtn").disabled = true;
  $("publishProductBtn").textContent = "发布中";
  try {
    $("saveStatus").textContent = "正在处理图片...";
    const productImage = await getUploadImageSrc("previewImage", state.recognition.category);
    const payload = {
      name: $("productNameInput").value.trim() || state.listing.title,
      category: state.recognition.category,
      price: Number($("sellerPriceInput").value) || state.latestPrice?.suggested || 99,
      condition: state.recognition.condition,
      description: state.listing.description,
      tags: [...(state.listing.sellingPoints || []), state.recognition.brand, state.recognition.model].filter(Boolean),
      image: productImage,
      sellerId: state.currentUser.id,
      sellerName: state.currentUser.name,
      campus: state.currentUser.campus
    };
    const productResponse = await postJson("/api/products", payload, authHeaders());
    if (!productResponse.data?.id || !productResponse.data?.name) throw new Error("发布接口未返回有效商品。");
    const product = productResponse.data;
    let saveMessage = `发布成功：${product.name}`;

    try {
      const productsResponse = await getJson("/api/products");
      const remoteProducts = productsResponse.data || [];
      const persisted = remoteProducts.some((item) => item.id === product.id);
      state.products = mergeProducts(persisted ? remoteProducts : [product, ...remoteProducts]);
      saveMessage = persisted
        ? `发布成功：${product.name}（已写入 ${storageLabel(productsResponse.storage)}，刷新后仍可见）`
        : `发布成功：${product.name}（商品列表可能稍后更新）`;
    } catch (verifyError) {
      state.products = mergeProducts([product, ...state.products]);
      saveMessage = `发布成功：${product.name}（复查列表失败：${apiErrorMessage(verifyError)}）`;
    }

    showAllMarketTab();
    renderMarketProducts("all");
    renderSearchResults(state.products.slice(0, 4));
    $("saveStatus").textContent = saveMessage;
    $("publishProductBtn").disabled = false;
    $("publishProductBtn").textContent = "发布商品";
    await showSuccessDialog("发布成功");
    navigateTo("market");
  } catch (error) {
    if (error?.status === 401) {
      clearSession();
      renderCurrentUser();
      $("loginStatus").textContent = "登录已失效，请重新登录。";
      $("saveStatus").textContent = "登录已失效，请重新登录。";
      navigateTo("login");
    } else {
      $("saveStatus").textContent = `发布失败：${apiErrorMessage(error)}`;
    }
  } finally {
    $("publishProductBtn").disabled = false;
    $("publishProductBtn").textContent = "发布商品";
  }
}

function selectProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  $("previewImage").src = product.image || imageFallbackFor(product.category);
  $("previewImage").dataset.uploadDataUrl = "";
  delete state.uploads.previewImage;
  $("productNameInput").value = product.name;
  $("categorySelect").value = product.category;
  $("brandModelInput").value = product.tags?.find((tag) => /^[A-Za-z]/.test(tag)) || product.name;
  $("rawDescription").value = "";
  $("sellerPriceInput").value = product.price;
  state.sellerPriceTouched = true;
  state.recognition = recognizeFromForm();
  renderRecognition(state.recognition);
  state.latestPrice = estimatePriceFrom(state.recognition);
  renderPrice(state.latestPrice);
  runRiskCheck(state.listing, state.latestPrice);
}

function localSearchIntent(query) {
  const budgetMatch = query.match(/(\d{2,6})/);
  const category = state.categories.find((item) => [item.category, ...item.aliases].some((alias) => query.includes(alias)))?.category || "不限";
  const keywords = query.split(/[，,\s]+/).filter(Boolean).slice(0, 5);
  return {
    categoryIntent: category,
    useCase: query.includes("新手") ? "新手友好" : "校园自用",
    budgetHint: budgetMatch ? Number(budgetMatch[1]) : null,
    keywords
  };
}

function searchCardsMarkup(products, reason = "") {
  return products
    .map(
      (item) => `
        <article class="result-card" data-id="${escapeText(item.id)}" role="link" tabindex="0" aria-label="查看 ${escapeText(item.name)} 的详情">
          <img src="${escapeText(item.image || imageFallbackFor(item.category))}" alt="${escapeText(item.name)}" data-fallback="${escapeText(imageFallbackFor(item.category))}">
          <div>
            <h3>${escapeText(item.name)}</h3>
            <p>${escapeText(item.category)} · ${escapeText(item.condition)} · 信用 ${productTrust(item)}${item.matchReason || reason ? ` · ${escapeText(item.matchReason || reason)}` : ""}</p>
            <small>${escapeText(item.description || (item.tags || []).join(" / "))}</small>
          </div>
          <strong>${money(item.price)}</strong>
        </article>
      `
    )
    .join("");
}

function bindSearchResultEvents() {

  document.querySelectorAll(".result-card img").forEach((image) => {
    image.addEventListener("error", () => {
      if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
    });
  });
  document.querySelectorAll(".result-card").forEach((card) => {
    card.addEventListener("click", () => openProductDetail(card.dataset.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProductDetail(card.dataset.id);
      }
    });
  });
}

function renderSearchResults(products, reason = "") {
  $("searchResults").innerHTML = products.length
    ? searchCardsMarkup(products, reason)
    : '<div class="page-state empty">没有找到符合条件的商品。</div>';
  bindSearchResultEvents();
}

function renderSearchMatches(query, matching) {
  const label = matching.terms.join("、") || query;
  const sections = [];
  if (matching.exactMatches.length) {
    sections.push(`
      <section class="search-group">
        <div class="search-group-head"><h3>精准结果</h3><span>${matching.exactMatches.length} 件</span></div>
        ${searchCardsMarkup(matching.exactMatches)}
      </section>
    `);
  } else {
    sections.push(`<div class="page-state empty">没有找到“${escapeText(label)}”的直接匹配商品。</div>`);
  }
  if (matching.similarRecommendations.length) {
    sections.push(`
      <section class="search-group related">
        <div class="search-group-head"><h3>相似推荐</h3><span>仅供参考，不是直接匹配</span></div>
        ${searchCardsMarkup(matching.similarRecommendations)}
      </section>
    `);
  }
  if (!matching.exactMatches.length && !matching.similarRecommendations.length) {
    sections.push('<div class="search-empty-note">可以调整预算或尝试更常见的商品名称。</div>');
  }
  $("searchResults").innerHTML = sections.join("");
  bindSearchResultEvents();
}

async function semanticSearch() {
  const query = $("searchInput").value.trim();
  if (!query) {
    $("intentBox").innerHTML = "";
    renderSearchResults([]);
    return;
  }
  let intent = localSearchIntent(query);
  try {
    const response = await postJson("/api/search-intent", { query });
    intent = response.data || intent;
  } catch {
    intent = localSearchIntent(query);
  }

  $("intentBox").innerHTML = [
    `品类：${intent.categoryIntent}`,
    `用途：${intent.useCase}`,
    intent.budgetHint ? `预算：${money(intent.budgetHint)}` : "预算：未指定",
    `关键词：${(intent.keywords || []).join("、") || "无"}`
  ]
    .map((item) => `<span>${escapeText(item)}</span>`)
    .join("");

  renderSearchMatches(query, SearchMatching.rankProducts(query, intent, state.products));
}

async function runAuthenticityCheck() {
  const category = $("authCategory").value;
  const model = $("authModel").value.trim();
  const price = Number($("authPrice").value) || 0;
  const serial = $("authSerial").value.trim();
  const description = $("authDescription").value.trim();
  const estimate = estimatePriceFrom({ category, model, condition: "九成新", accessory: "full" });
  const ratio = price / Math.max(estimate.suggested, 1);
  let score = 58;
  const findings = [];

  if (serial.length >= 8) {
    score += 14;
    findings.push("已填写序列号/防伪码，建议到品牌官网或官方客服二次核验。");
  } else {
    score -= 12;
    findings.push("未填写序列号/防伪码，真伪判断可信度下降。");
  }

  if (/发票|购买记录|原盒|保修|国行|官方/.test(description)) {
    score += 14;
    findings.push("描述中包含发票、原盒、保修或官方渠道信息，可信度提升。");
  } else {
    score -= 6;
    findings.push("缺少购买凭证或保修信息，建议要求卖家补充证明。");
  }

  if (ratio < 0.72) {
    score -= 18;
    findings.push(`报价低于建议价较多：当前 ${money(price)}，参考 ${money(estimate.suggested)}，需警惕假货或问题机。`);
  } else if (ratio > 1.28) {
    score -= 6;
    findings.push("报价高于参考价，建议核对配件、保修和成色是否支撑溢价。");
  } else {
    score += 8;
    findings.push("报价处于合理区间，价格风险较低。");
  }

  if (category === "数码电子") {
    findings.push("数码商品验货重点：序列号、激活状态、电池健康、屏幕、摄像头、维修记录。");
  } else if (category === "运动户外") {
    findings.push("运动用品验货重点：结构裂纹、磨损位置、尺码匹配和安全配件。");
  } else {
    findings.push("建议当面检查外观、功能、配件和卖家历史信用。");
  }

  score = Math.max(12, Math.min(96, score));
  const verdict = score >= 82 ? "可信度较高，仍建议当面验货" : score >= 62 ? "中等可信，需要补充证明" : "风险偏高，谨慎交易";

  const localAssessment = { score, verdict, findings };
  $("authScore").textContent = "AI 分析中...";
  try {
    const response = await postJson("/api/ai/authenticity-risk", {
      category,
      model,
      price,
      serialProvided: serial.length >= 8,
      description,
      estimatedPrice: estimate.suggested,
      userExternalId: state.currentUser?.id || null,
      localAssessment
    }, authHeaders());
    const assessment = response.data || localAssessment;
    $("authScore").textContent = `${Math.round(Number(assessment.score) || 0)}%`;
    $("authVerdict").textContent = `${assessment.verdict} · ${assessment.provider === "deepseek" ? "DeepSeek AI" : "本地模型"}`;
    $("authFindings").innerHTML = (assessment.findings || findings).map((item) => `<div>${escapeText(item)}</div>`).join("");
  } catch (error) {
    $("authScore").textContent = `${score}%`;
    $("authVerdict").textContent = `${verdict} · 本地模型`;
    $("authFindings").innerHTML = [...findings, apiErrorMessage(error, "AI 暂不可用，已使用本地风险评估。")].map((item) => `<div>${escapeText(item)}</div>`).join("");
  }
}

function fileToCompressedDataUrl(file, maxSize = 1200, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function isPersistableImageSrc(src) {
  return Boolean(src && !String(src).startsWith("blob:") && String(src).trim());
}

async function getUploadImageSrc(imageId, fallbackCategory) {
  if (state.uploads[imageId]) {
    try {
      const uploaded = await state.uploads[imageId];
      if (isPersistableImageSrc(uploaded)) return uploaded;
    } catch {
      // Fall back to the current preview if the browser cannot decode the file.
    }
  }
  const image = $(imageId);
  if (isPersistableImageSrc(image.dataset.uploadDataUrl)) return image.dataset.uploadDataUrl;
  if (isPersistableImageSrc(image.src)) return image.src;
  return imageFallbackFor(fallbackCategory);
}

function switchAccountTab(tab) {
  const next = ["profile", "password", "security"].includes(tab) ? tab : "profile";
  state.accountTab = next;
  document.querySelectorAll("[data-account-tab]").forEach((button) => {
    const active = button.dataset.accountTab === next;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("accountProfilePanel").hidden = next !== "profile";
  $("accountPasswordPanel").hidden = next !== "password";
  $("accountSecurityPanel").hidden = next !== "security";
}

function renderAccountSettings() {
  if (!hasAuthenticatedSession()) return;
  $("profileNameInput").value = state.currentUser.name || "";
  $("profileCampusInput").value = state.currentUser.campus || "";
  switchAccountTab(state.accountTab);
}

async function submitProfile(event) {
  event.preventDefault();
  const name = $("profileNameInput").value.trim();
  const campus = $("profileCampusInput").value.trim();
  if (!name || !campus) {
    $("profileStatus").textContent = "昵称和校区不能为空。";
    return;
  }
  const button = $("profileSubmitBtn");
  button.disabled = true;
  $("profileStatus").textContent = "正在保存...";
  try {
    const response = await patchJson("/api/account/profile", { name, campus }, authHeaders());
    state.currentUser = { ...state.currentUser, ...response.data };
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(state.currentUser));
    renderCurrentUser();
    $("profileStatus").textContent = "资料已同步到服务器。";
    await showSuccessDialog("资料修改成功");
  } catch (error) {
    if (!handleExpiredMarketplaceSession(error)) $("profileStatus").textContent = `保存失败：${marketplaceErrorMessage(error)}`;
  } finally {
    button.disabled = false;
  }
}

async function submitPassword(event) {
  event.preventDefault();
  const currentPassword = $("currentPasswordInput").value;
  const newPassword = $("newPasswordInput").value;
  const confirmPassword = $("confirmNewPasswordInput").value;
  if (!currentPassword) {
    $("passwordStatus").textContent = "请输入当前密码。";
    return;
  }
  if (newPassword.length < 8) {
    $("passwordStatus").textContent = "新密码至少需要 8 个字符。";
    return;
  }
  if (newPassword !== confirmPassword) {
    $("passwordStatus").textContent = "两次输入的新密码不一致。";
    return;
  }
  const button = $("passwordSubmitBtn");
  button.disabled = true;
  $("passwordStatus").textContent = "正在修改密码...";
  try {
    await patchJson("/api/account/password", { currentPassword, newPassword }, authHeaders());
    $("passwordForm").reset();
    await showSuccessDialog("密码修改成功，请重新登录");
    clearSession();
    renderCurrentUser();
    switchAuthMode("login");
    $("loginStatus").textContent = "密码已修改，旧会话已失效，请使用新密码登录。";
    navigateTo("login");
  } catch (error) {
    if (isPasswordRejection(error)) {
      $("passwordStatus").textContent = `修改失败：${apiErrorMessage(error)}`;
    } else if (!handleExpiredMarketplaceSession(error)) {
      $("passwordStatus").textContent = `修改失败：${marketplaceErrorMessage(error)}`;
    }
  } finally {
    button.disabled = false;
  }
}

async function openDeleteAccount() {
  const confirmed = await showConfirmDialog("注销后账户不可恢复。是否继续进行密码验证？", "继续注销");
  if (!confirmed) return;
  $("deleteAccountForm").reset();
  $("deleteAccountStatus").textContent = "";
  $("deleteAccountDialog").showModal();
}

async function submitDeleteAccount(event) {
  event.preventDefault();
  const password = $("deleteAccountPassword").value;
  if (!password) {
    $("deleteAccountStatus").textContent = "请输入当前密码。";
    return;
  }
  const button = $("deleteAccountSubmit");
  button.disabled = true;
  $("deleteAccountStatus").textContent = "正在检查账户状态...";
  try {
    await deleteJsonWithBody("/api/account", { password }, authHeaders());
    $("deleteAccountDialog").close();
    clearSession();
    renderCurrentUser();
    switchAuthMode("login");
    $("loginStatus").textContent = "账户已注销，登录状态已清除。";
    navigateTo("login");
  } catch (error) {
    if (isPasswordRejection(error)) {
      $("deleteAccountStatus").textContent = `注销失败：${apiErrorMessage(error)}`;
    } else if (!handleExpiredMarketplaceSession(error)) {
      $("deleteAccountStatus").textContent = `注销失败：${marketplaceErrorMessage(error)}`;
    }
  } finally {
    button.disabled = false;
  }
}

const ADMIN_USER_STATUS = { active: "正常", disabled: "已禁用", deleted: "已注销" };
const ADMIN_RISK_STATUS = { pending: "待审核", confirmed: "已确认", false_positive: "误报", resolved: "已处理" };
const ADMIN_RISK_LEVEL = { high: "高", medium: "中", low: "低" };

function adminEmpty(message) {
  return `<div class="workspace-empty compact"><strong>${escapeText(message)}</strong><p>可调整筛选条件后重新查询。</p></div>`;
}

function renderAdminOverview() {
  const data = state.adminOverview;
  if (!data) {
    $("adminOverviewGrid").innerHTML = adminEmpty("暂无概览数据");
    return;
  }
  const metrics = [
    ["用户总数", data.users], ["今日新增", data.newUsersToday], ["在售商品", data.onSaleProducts],
    ["已预订", data.reservedProducts], ["已售出", data.soldProducts], ["已下架", data.offlineProducts],
    ["待处理交易", data.pendingTransactions], ["已完成交易", data.finishedTransactions],
    ["高风险待审", data.pendingHighRisks], ["风险待审", data.pendingRisks],
    ["DeepSeek 报告", data.deepSeekReports], ["本地回退报告", data.fallbackReports]
  ];
  $("adminOverviewGrid").innerHTML = metrics.map(([label, value]) => `<article class="admin-metric"><span>${label}</span><strong>${Number(value) || 0}</strong></article>`).join("");
}

function renderAdminUsers() {
  if (!state.adminUsers.length) {
    $("adminUsersList").innerHTML = adminEmpty("没有符合条件的用户");
    return;
  }
  $("adminUsersList").innerHTML = `<table class="admin-table"><thead><tr><th>用户</th><th>角色 / 状态</th><th>业务数据</th><th>注册时间</th><th>操作</th></tr></thead><tbody>${state.adminUsers.map((user) => {
    const isSelf = String(user.id) === String(state.currentUser.id);
    const isDeleted = user.accountStatus === "deleted";
    const nextStatus = user.accountStatus === "disabled" ? "active" : "disabled";
    const action = isDeleted
      ? `<small>已注销，不可操作</small>`
      : `<button class="table-action ${nextStatus === "disabled" ? "danger-button" : "ghost-button"}" type="button" data-admin-user-id="${escapeText(user.id)}" data-next-status="${nextStatus}" ${isSelf ? "disabled title=\"不能操作当前管理员账号\"" : ""}>${nextStatus === "disabled" ? "禁用" : "启用"}</button>`;
    return `<tr><td><strong>${escapeText(user.name)}</strong><small>${escapeText(user.loginName || "无登录账号")} · ${escapeText(user.campus)}</small></td><td><span class="status-chip">${user.role === "admin" ? "管理员" : "普通用户"}</span> <span class="status-chip ${user.accountStatus === "disabled" || isDeleted ? "danger" : ""}">${ADMIN_USER_STATUS[user.accountStatus] || user.accountStatus}</span></td><td><small>商品 ${Number(user.productCount) || 0} · 交易 ${Number(user.transactionCount) || 0} · 风险 ${Number(user.riskCount) || 0}</small></td><td><small>${formatDate(user.createdAt)}</small></td><td>${action}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderAdminProducts() {
  if (!state.adminProducts.length) {
    $("adminProductsList").innerHTML = adminEmpty("没有符合条件的商品");
    return;
  }
  $("adminProductsList").innerHTML = `<table class="admin-table"><thead><tr><th>商品</th><th>卖家</th><th>状态</th><th>风险</th><th>操作</th></tr></thead><tbody>${state.adminProducts.map((product) => {
    const canOffline = product.status === "on_sale";
    const canRestore = product.status === "offline" && product.moderationStatus === "admin_offline";
    const action = canOffline ? "offline" : canRestore ? "restore" : "";
    return `<tr><td><strong>${escapeText(product.name)}</strong><small>${escapeText(product.category)} · ${money(product.price)}</small></td><td>${escapeText(product.sellerName || "未知卖家")}</td><td><span class="status-chip">${statusLabel(product.status)}</span>${product.adminOfflineReason ? `<small>${escapeText(product.adminOfflineReason)}</small>` : ""}</td><td>${Number(product.riskCount) || 0}</td><td>${action ? `<button class="table-action ${action === "offline" ? "danger-button" : "ghost-button"}" type="button" data-admin-product-id="${escapeText(product.id)}" data-product-action="${action}">${action === "offline" ? "下架" : "恢复"}</button>` : `<small>当前不可操作</small>`}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderAdminRisks() {
  if (!state.adminRisks.length) {
    $("adminRisksList").innerHTML = adminEmpty("没有符合条件的风险记录");
    return;
  }
  $("adminRisksList").innerHTML = `<table class="admin-table"><thead><tr><th>风险</th><th>对象</th><th>等级</th><th>审核状态</th><th>操作</th></tr></thead><tbody>${state.adminRisks.map((risk) => `<tr><td><strong>${escapeText(risk.type || risk.ruleCode || "风险提示")}</strong><small>${escapeText(risk.message)}</small></td><td><small>${escapeText(risk.productName || risk.userName || "-")}</small></td><td><span class="status-chip ${risk.level === "high" ? "danger" : ""}">${ADMIN_RISK_LEVEL[risk.level] || risk.level}</span></td><td><span class="status-chip">${ADMIN_RISK_STATUS[risk.reviewStatus] || risk.reviewStatus}</span>${risk.reviewNote ? `<small>${escapeText(risk.reviewNote)}</small>` : ""}</td><td><button class="table-action ghost-button" type="button" data-admin-risk-id="${escapeText(risk.id)}">审核</button></td></tr>`).join("")}</tbody></table>`;
}

function renderAdminLogs() {
  if (!state.adminLogs.length) {
    $("adminLogsList").innerHTML = adminEmpty("暂无管理员操作日志");
    return;
  }
  $("adminLogsList").innerHTML = `<table class="admin-table"><thead><tr><th>管理员</th><th>操作</th><th>目标</th><th>原因</th><th>时间</th></tr></thead><tbody>${state.adminLogs.map((log) => `<tr><td>${escapeText(log.adminName || log.adminId)}</td><td><strong>${escapeText(log.actionType)}</strong></td><td><small>${escapeText(log.targetType)} · ${escapeText(log.targetId)}</small></td><td><small>${escapeText(log.reason || "-")}</small></td><td><small>${formatDate(log.createdAt)}</small></td></tr>`).join("")}</tbody></table>`;
}

function switchAdminTab(tab) {
  const next = ["overview", "users", "products", "risks", "logs"].includes(tab) ? tab : "overview";
  state.adminTab = next;
  document.querySelectorAll("[data-admin-tab]").forEach((button) => button.classList.toggle("active", button.dataset.adminTab === next));
  ["Overview", "Users", "Products", "Risks", "Logs"].forEach((name) => {
    $(`admin${name}Panel`).hidden = name.toLowerCase() !== next;
  });
}

async function refreshAdminSection() {
  if (!hasAuthenticatedSession() || state.currentUser.role !== "admin") return;
  switchAdminTab(state.adminTab);
  setWorkspaceStatus("adminPageStatus", "正在加载管理数据...", "loading");
  const paths = {
    overview: "/api/admin/overview",
    users: `/api/admin/users?q=${encodeURIComponent($("adminUserQuery").value.trim())}&status=${encodeURIComponent($("adminUserStatus").value)}`,
    products: `/api/admin/products?q=${encodeURIComponent($("adminProductQuery").value.trim())}&status=${encodeURIComponent($("adminProductStatus").value)}`,
    risks: `/api/admin/risks?status=${encodeURIComponent($("adminRiskStatus").value)}&level=${encodeURIComponent($("adminRiskLevel").value)}`,
    logs: "/api/admin/audit-logs"
  };
  try {
    const response = await getJson(paths[state.adminTab], authHeaders());
    if (state.adminTab === "overview") state.adminOverview = response.data;
    if (state.adminTab === "users") state.adminUsers = response.data || [];
    if (state.adminTab === "products") state.adminProducts = response.data || [];
    if (state.adminTab === "risks") state.adminRisks = response.data || [];
    if (state.adminTab === "logs") state.adminLogs = response.data || [];
    ({ overview: renderAdminOverview, users: renderAdminUsers, products: renderAdminProducts, risks: renderAdminRisks, logs: renderAdminLogs })[state.adminTab]();
    setWorkspaceStatus("adminPageStatus", "");
  } catch (error) {
    if (!handleExpiredMarketplaceSession(error)) setWorkspaceStatus("adminPageStatus", `加载失败：${marketplaceErrorMessage(error)}`, "error");
  }
}

function openAdminAction(action) {
  state.adminAction = action;
  const isRisk = action.type === "risk";
  const title = action.type === "user" ? `${action.status === "disabled" ? "禁用" : "启用"}用户` : action.type === "product" ? `${action.action === "offline" ? "下架" : "恢复"}商品` : "审核风险记录";
  $("adminActionTitle").textContent = title;
  $("adminActionDescription").textContent = action.description || "请填写本次操作的原因，提交后将记录到审计日志。";
  $("adminReviewStatusField").hidden = !isRisk;
  $("adminActionReasonLabel").textContent = isRisk ? "审核备注" : "操作原因";
  $("adminActionReason").value = "";
  $("adminActionStatus").textContent = "";
  $("adminActionDialog").showModal();
}

async function submitAdminAction(event) {
  event.preventDefault();
  const action = state.adminAction;
  const reason = $("adminActionReason").value.trim();
  if (!action || !reason) {
    $("adminActionStatus").textContent = "请填写操作原因或审核备注。";
    return;
  }
  const button = $("adminActionSubmit");
  button.disabled = true;
  $("adminActionStatus").textContent = "正在提交...";
  try {
    if (action.type === "user") await patchJson(`/api/admin/users/${encodeURIComponent(action.id)}/status`, { accountStatus: action.status, reason }, authHeaders());
    if (action.type === "product") await postJson(`/api/admin/products/${encodeURIComponent(action.id)}/${action.action}`, { reason }, authHeaders());
    if (action.type === "risk") await patchJson(`/api/admin/risks/${encodeURIComponent(action.id)}/review`, { reviewStatus: $("adminReviewStatus").value, note: reason }, authHeaders());
    $("adminActionDialog").close();
    await refreshAdminSection();
    await showSuccessDialog("管理员操作已完成并写入审计日志");
  } catch (error) {
    if (!handleExpiredMarketplaceSession(error)) $("adminActionStatus").textContent = `提交失败：${marketplaceErrorMessage(error)}`;
  } finally {
    button.disabled = false;
  }
}

function bindUpload(inputId, imageId) {
  $(inputId).addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("请上传图片文件");
      return;
    }

    const image = $(imageId);
    const previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    image.dataset.uploadDataUrl = "";

    state.uploads[imageId] = (async () => {
      try {
        const dataUrl = await fileToCompressedDataUrl(file);
        image.src = dataUrl;
        image.dataset.uploadDataUrl = dataUrl;
        URL.revokeObjectURL(previewUrl);
        return dataUrl;
      } catch {
        const dataUrl = await fileToDataUrl(file);
        image.src = dataUrl;
        image.dataset.uploadDataUrl = dataUrl;
        URL.revokeObjectURL(previewUrl);
        return dataUrl;
      }
    })();

    try {
      await state.uploads[imageId];
    } catch {
      alert("图片读取失败，请换一张图片");
    }
  });
}

function setupEvents() {
  bindRouter();
  $("profileForm").addEventListener("submit", submitProfile);
  $("passwordForm").addEventListener("submit", submitPassword);
  document.querySelectorAll("[data-account-tab]").forEach((button) => button.addEventListener("click", () => switchAccountTab(button.dataset.accountTab)));
  $("openDeleteAccountBtn").addEventListener("click", openDeleteAccount);
  $("deleteAccountForm").addEventListener("submit", submitDeleteAccount);
  $("deleteAccountCancel").addEventListener("click", () => $("deleteAccountDialog").close());
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      switchAdminTab(button.dataset.adminTab);
      refreshAdminSection();
    });
  });
  $("adminRefreshBtn").addEventListener("click", refreshAdminSection);
  ["adminUsersFilter", "adminProductsFilter", "adminRisksFilter"].forEach((id) => {
    $(id).addEventListener("submit", (event) => {
      event.preventDefault();
      refreshAdminSection();
    });
  });
  $("adminUsersList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-user-id]");
    if (button) openAdminAction({ type: "user", id: button.dataset.adminUserId, status: button.dataset.nextStatus });
  });
  $("adminProductsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-product-id]");
    if (button) openAdminAction({ type: "product", id: button.dataset.adminProductId, action: button.dataset.productAction });
  });
  $("adminRisksList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-risk-id]");
    if (button) openAdminAction({ type: "risk", id: button.dataset.adminRiskId });
  });
  $("adminActionForm").addEventListener("submit", submitAdminAction);
  $("adminActionCancel").addEventListener("click", () => $("adminActionDialog").close());
  $("adminActionDialog").addEventListener("close", () => { state.adminAction = null; });
  $("loginForm").addEventListener("submit", loginUser);
  $("registerForm").addEventListener("submit", registerUser);
  $("loginTab").addEventListener("click", () => switchAuthMode("login"));
  $("registerTab").addEventListener("click", () => switchAuthMode("register"));
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => switchAuthMode(button.dataset.authMode));
  });
  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $(button.dataset.passwordTarget);
      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      button.textContent = showPassword ? "隐藏" : "显示";
      button.setAttribute("aria-label", `${showPassword ? "隐藏" : "显示"}密码`);
    });
  });
  $("logoutBtn").addEventListener("click", logoutUser);
  $("detailBackBtn").addEventListener("click", () => navigateTo("market"));
  $("myProductsPublishBtn").addEventListener("click", () => navigateTo("publish"));
  $("emptyPublishBtn").addEventListener("click", () => navigateTo("publish"));
  $("emptyBrowseBtn").addEventListener("click", () => navigateTo("market"));
  $("favoritesBrowseBtn").addEventListener("click", () => navigateTo("market"));
  $("favoritesEmptyBrowseBtn").addEventListener("click", () => navigateTo("market"));
  $("messagesRefreshBtn").addEventListener("click", () => refreshConversations());
  $("messagesBackBtn").addEventListener("click", () => {
    state.mobileThreadOpen = false;
    renderMessageThread();
  });
  $("messageForm").addEventListener("submit", sendMessage);
  $("messageInput").addEventListener("input", () => {
    $("messageInputCount").textContent = `${$("messageInput").value.length} / 1000`;
    if ($("messageSendStatus").textContent === "消息不能为空。") $("messageSendStatus").textContent = "";
  });
  $("editProductForm").addEventListener("submit", submitProductEdit);
  $("editProductCancel").addEventListener("click", () => $("editProductDialog").close());
  $("editProductDialog").addEventListener("close", () => {
    state.editingProductId = "";
    $("editProductStatus").textContent = "";
  });
  document.querySelectorAll("[data-product-status]").forEach((button) => {
    button.addEventListener("click", () => {
      state.myProductFilter = button.dataset.productStatus;
      document.querySelectorAll("[data-product-status]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      renderMyProducts();
    });
  });
  document.querySelectorAll("[data-transaction-role]").forEach((button) => {
    button.addEventListener("click", () => {
      state.transactionRole = button.dataset.transactionRole;
      updateTransactionTabs();
    });
  });
  document.querySelectorAll("[data-ai-report-type]").forEach((button) => {
    button.addEventListener("click", () => {
      state.aiReportType = button.dataset.aiReportType;
      document.querySelectorAll("[data-ai-report-type]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", String(active));
      });
      refreshAIHistory();
    });
  });
  $("estimateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderEstimate();
  });
  ["estimateCategory", "estimateModel", "estimateCondition", "estimateAccessory"].forEach((id) => {
    $(id).addEventListener("change", renderEstimate);
  });
  $("authCheckBtn").addEventListener("click", runAuthenticityCheck);
  $("generateBtn").addEventListener("click", generateListing);
  $("generateBtnSecondary").addEventListener("click", generateListing);
  $("publishProductBtn").addEventListener("click", saveCurrentProduct);
  $("searchBtn").addEventListener("click", semanticSearch);
  $("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") semanticSearch();
  });
  ["conditionSelect", "categorySelect", "brandModelInput"].forEach((id) => {
    $(id).addEventListener("change", () => {
      state.recognition = recognizeFromForm();
      renderRecognition(state.recognition);
      state.latestPrice = estimatePriceFrom(state.recognition);
      renderPrice(state.latestPrice);
      runRiskCheck(state.listing, state.latestPrice);
    });
    $(id).addEventListener("input", () => {
      state.recognition = recognizeFromForm();
      renderRecognition(state.recognition);
    });
  });
  $("sellerPriceInput").addEventListener("input", () => {
    state.sellerPriceTouched = true;
    runRiskCheck(state.listing, state.latestPrice);
  });
  $("accountSelect").addEventListener("change", () => runRiskCheck(state.listing, state.latestPrice));
  document.querySelectorAll(".prompt-chips button").forEach((button) => {
    button.addEventListener("click", () => {
      const current = $("rawDescription").value.trim();
      $("rawDescription").value = current ? `${current} ${button.dataset.prompt}` : button.dataset.prompt;
      $("rawDescription").focus();
    });
  });
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderMarketProducts(button.dataset.filter);
    });
  });
  bindUpload("imageInput", "previewImage");
  bindUpload("authImageInput", "authPreview");
}

async function init() {
  setupEvents();
  setMarketStatus("正在加载商品...", "loading");
  const [categories, transactions, risks] = await Promise.all([
    getJson("/data/category-knowledge.json"),
    getJson("/data/market-transactions.json"),
    getJson("/data/risk-rules.json")
  ]);
  state.categories = categories;
  state.transactions = transactions;
  state.risks = risks;

  populateCategorySelects();
  localStorage.removeItem("campusLoopUserId");
  await restoreSession();
  state.selectedProductId = sessionStorage.getItem(SELECTED_PRODUCT_KEY) || "";
  renderCurrentUser();
  switchAuthMode("login");
  await refreshProducts();
  renderEstimate();
  state.recognition = recognizeFromForm();
  renderRecognition(state.recognition);
  state.latestPrice = estimatePriceFrom(state.recognition);
  renderPrice(state.latestPrice);
  runRiskCheck(state.listing, state.latestPrice);
}

init().catch((error) => {
  console.error(error);
  setMarketStatus(`页面初始化失败：${apiErrorMessage(error)}`, "error");
  $("loginStatus").textContent = `页面初始化失败：${apiErrorMessage(error)}`;
});
