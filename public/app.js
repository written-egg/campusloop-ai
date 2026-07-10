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

const routes = {
  market: "page-market",
  detail: "page-detail",
  estimate: "page-estimate",
  authenticity: "page-authenticity",
  publish: "page-publish",
  search: "page-search",
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

async function getJson(url) {
  return requestJson(url);
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

function apiErrorMessage(error, fallback = "请求失败，请检查本地服务是否正在运行。") {
  if (error?.name === "AbortError") return "网络连接超时，请稍后重试。";
  if (error?.status === 400) return `输入内容不符合要求：${error.message || "请检查后重试。"}`;
  if (error?.status === 401) return error.message || "账号密码错误或登录已失效。";
  if (error?.status === 409) return "账号已经存在，请直接登录或更换账号。";
  if (error?.status === 413) return "图片或请求内容过大，请压缩图片后重试。";
  if (error?.status === 503) return "SQL Server 未配置或暂时不可用，请联系 A 检查数据库环境。";
  if (error instanceof TypeError) return "网络连接失败，请确认本地服务正在运行。";
  if (!error) return fallback;
  if (typeof error === "string") return error;
  return error.message || fallback;
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

function persistSession(account) {
  const { sessionToken, ...currentUser } = account || {};
  if (!currentUser.id || !sessionToken) throw new Error("认证接口未返回完整的用户和会话令牌。");
  state.currentUser = currentUser;
  state.sessionToken = sessionToken;
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(currentUser));
  sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
}

function restoreSession() {
  try {
    const currentUser = JSON.parse(sessionStorage.getItem(SESSION_USER_KEY) || "null");
    const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    if (!currentUser?.id || !sessionToken) throw new Error("Incomplete session");
    state.currentUser = currentUser;
    state.sessionToken = sessionToken;
  } catch {
    clearSession();
  }
}

function clearSession() {
  state.currentUser = null;
  state.sessionToken = "";
  sessionStorage.removeItem(SESSION_USER_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

function setRoute(routeName) {
  let route = routes[routeName] ? routeName : "market";
  if (route === "publish" && !hasAuthenticatedSession()) {
    route = "login";
    $("loginStatus").textContent = "请先登录，再发布商品。";
  }
  state.activeRoute = route;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-list a").forEach((link) => link.classList.toggle("active", link.dataset.route === route));
  $(routes[route]).classList.add("active");
  if (route === "detail") renderProductDetail(state.selectedProductId || sessionStorage.getItem(SELECTED_PRODUCT_KEY));
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
  $("accountAction").textContent = loggedIn ? state.currentUser.name || "个人中心" : "登录";
  $("logoutBtn").hidden = !loggedIn;
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
    logoutMessage = `退出接口未完成，但本地登录状态已清除：${apiErrorMessage(error)}`;
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

function renderProductDetail(id) {
  const status = $("detailStatus");
  const content = $("detailContent");
  const product = state.products.find((item) => String(item.id) === String(id || ""));
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
      <div class="detail-actions" aria-label="后续交易功能占位">
        <button type="button" disabled title="收藏功能后续开发">收藏</button>
        <button type="button" disabled title="消息功能后续开发">联系卖家</button>
        <button type="button" disabled title="交易功能后续开发">立即预订</button>
      </div>
    </div>
  `;
  const image = $("detailImage");
  image.addEventListener("error", () => {
    if (image.src !== image.dataset.fallback) image.src = image.dataset.fallback;
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

function renderEstimate() {
  const price = estimatePriceFrom({
    category: $("estimateCategory").value,
    model: $("estimateModel").value,
    condition: $("estimateCondition").value,
    accessory: $("estimateAccessory").value
  });
  $("estimatePrice").textContent = money(price.suggested);
  $("estimateRange").textContent = `建议区间 ${money(price.min)} - ${money(price.max)}`;
  $("estimateReasons").innerHTML = price.reasons.map((item) => `<div>${escapeText(item)}</div>`).join("");
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

  $("riskBox").innerHTML = findings.map((item) => `<div><strong>${escapeText(item.name)}</strong><br>${escapeText(item.message)}</div>`).join("");
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
        : `发布成功：${product.name}（接口已返回成功，列表同步稍有延迟）`;
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

function renderSearchResults(products, reason = "") {
  if (!products.length) {
    $("searchResults").innerHTML = '<div class="page-state empty">没有找到符合条件的商品。</div>';
    return;
  }
  $("searchResults").innerHTML = products
    .map(
      (item) => `
        <article class="result-card" data-id="${escapeText(item.id)}" role="link" tabindex="0" aria-label="查看 ${escapeText(item.name)} 的详情">
          <img src="${escapeText(item.image || imageFallbackFor(item.category))}" alt="${escapeText(item.name)}" data-fallback="${escapeText(imageFallbackFor(item.category))}">
          <div>
            <h3>${escapeText(item.name)}</h3>
            <p>${escapeText(item.category)} · ${escapeText(item.condition)} · 信用 ${productTrust(item)}${reason ? ` · ${escapeText(reason)}` : ""}</p>
            <small>${escapeText(item.description || (item.tags || []).join(" / "))}</small>
          </div>
          <strong>${money(item.price)}</strong>
        </article>
      `
    )
    .join("");

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

async function semanticSearch() {
  const query = $("searchInput").value.trim();
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

  const results = state.products
    .map((item) => {
      const haystack = `${item.name} ${item.category} ${(item.tags || []).join(" ")}`;
      let score = 0;
      if (intent.categoryIntent !== "不限" && item.category.includes(intent.categoryIntent)) score += 4;
      (intent.keywords || []).forEach((keyword) => {
        if (haystack.includes(keyword)) score += 2;
      });
      if (String(intent.useCase).includes("新手") && haystack.includes("新手")) score += 3;
      if (intent.budgetHint && item.price <= intent.budgetHint) score += 2;
      return { ...item, matchScore: score };
    })
    .filter((item) => item.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);

  renderSearchResults(results.length ? results : state.products, "语义匹配");
}

function runAuthenticityCheck() {
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

  $("authScore").textContent = `${score}%`;
  $("authVerdict").textContent = verdict;
  $("authFindings").innerHTML = findings.map((item) => `<div>${escapeText(item)}</div>`).join("");
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
  $("estimateForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderEstimate();
  });
  ["estimateCategory", "estimateModel", "estimateCondition", "estimateAccessory"].forEach((id) => {
    $(id).addEventListener("change", renderEstimate);
    $(id).addEventListener("input", renderEstimate);
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
  restoreSession();
  state.selectedProductId = sessionStorage.getItem(SELECTED_PRODUCT_KEY) || "";
  renderCurrentUser();
  switchAuthMode("login");
  await refreshProducts();
  setupEvents();
  renderEstimate();
  runAuthenticityCheck();
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
