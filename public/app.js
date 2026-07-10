const state = {
  categories: [],
  transactions: [],
  products: [],
  users: [],
  risks: [],
  currentUser: null,
  recognition: null,
  listing: null,
  latestPrice: null,
  sellerPriceTouched: false,
  uploads: {},
  activeRoute: "market"
};

const $ = (id) => document.getElementById(id);
const LOCAL_PRODUCTS_KEY = "campusLoopLocalProducts";

const routes = {
  market: "page-market",
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

async function getJson(url) {
  const response = await fetchWithTimeout(url);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    12000
  );
  return response.json();
}

function apiErrorMessage(error, fallback = "请求失败，请检查本地服务是否正在运行。") {
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
  [...loadLocalProducts(), ...remoteProducts].forEach((product) => {
    if (product?.id && !merged.has(product.id)) merged.set(product.id, product);
  });
  return [...merged.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function showAllMarketTab() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === "all");
  });
}

function setRoute(routeName) {
  const route = routes[routeName] ? routeName : "market";
  state.activeRoute = route;
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-list a").forEach((link) => link.classList.toggle("active", link.dataset.route === route));
  $(routes[route]).classList.add("active");
}

function bindRouter() {
  const apply = () => setRoute((location.hash || "#market").slice(1));
  window.addEventListener("hashchange", apply);
  document.querySelectorAll("a[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const route = link.dataset.route;
      setRoute(route);
      history.replaceState(null, "", `#${route}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
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
  $("currentUserText").textContent = state.currentUser
    ? `${state.currentUser.name} · ${state.currentUser.campus} · 信用 ${state.currentUser.trustScore}`
    : "未登录";
}

async function loginUser(event) {
  event?.preventDefault();
  $("loginStatus").textContent = "正在连接用户接口...";
  try {
    const response = await postJson("/api/users", {
      name: $("loginNameInput").value,
      campus: $("loginCampusInput").value
    });
    if (!response.ok || !response.data?.id) throw new Error(response.error || "用户接口未返回有效用户");
    state.currentUser = response.data;
    localStorage.setItem("campusLoopUserId", state.currentUser.id);
    if (!state.users.some((user) => user.id === state.currentUser.id)) state.users.unshift(state.currentUser);
    renderCurrentUser();
    $("loginStatus").textContent = `已登录：${state.currentUser.name}，用户已由后端接口创建或复用。`;
    $("saveStatus").textContent = `已登录：${state.currentUser.name}`;
    location.hash = "publish";
  } catch (error) {
    state.currentUser = null;
    renderCurrentUser();
    $("loginStatus").textContent = `登录失败：${apiErrorMessage(error)}`;
    $("saveStatus").textContent = "请先完成登录接口联调，再发布商品。";
  }
}

function renderMarketProducts(category = "all") {
  const products = category === "all" ? state.products : state.products.filter((item) => item.category === category);
  $("marketGrid").innerHTML = products
    .map(
      (item) => {
        const discount = discountText(item);
        return `
        <article class="market-card" data-id="${escapeText(item.id)}">
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
    card.addEventListener("click", () => {
      selectProduct(card.dataset.id);
      location.hash = "publish";
    });
  });
}

async function refreshProducts() {
  const response = await getJson("/api/products");
  state.products = mergeProducts(response.data || []);
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
  if (!state.currentUser) {
    $("saveStatus").textContent = "请先登录，再发布商品。";
    location.hash = "login";
    return;
  }
  if (!state.recognition || !state.listing) await generateListing();

  $("publishProductBtn").disabled = true;
  $("publishProductBtn").textContent = "发布中";
  try {
    const productImage = await getUploadImageSrc("previewImage");
    const payload = {
      name: $("productNameInput").value.trim() || state.listing.title,
      category: state.recognition.category,
      price: Number($("sellerPriceInput").value) || state.latestPrice?.suggested || 99,
      condition: state.recognition.condition,
      tags: [...(state.listing.sellingPoints || []), state.recognition.brand, state.recognition.model].filter(Boolean),
      image: productImage,
      sellerId: state.currentUser.id,
      sellerName: state.currentUser.name,
      campus: state.currentUser.campus
    };
    let product = null;
    let saveMessage = "";
    try {
      const productResponse = await postJson("/api/products", payload);
      if (!productResponse.ok || !productResponse.data?.name) throw new Error(productResponse.error || "发布接口未返回商品");
      product = productResponse.data;
      try {
        const productsResponse = await getJson("/api/products");
        const remoteProducts = productsResponse.data || [];
        const persisted = remoteProducts.some((item) => item.id === product.id);
        if (persisted) {
          state.products = mergeProducts(remoteProducts);
          saveMessage = `发布成功：${product.name}（已写入 ${storageLabel(productsResponse.storage)}，刷新后仍可见）`;
        } else {
          state.products = mergeProducts([product, ...remoteProducts]);
          saveMessage = `发布成功：${product.name}（接口已返回成功，但复查列表暂未命中，请刷新后再次确认）`;
        }
      } catch (verifyError) {
        state.products = mergeProducts([product, ...state.products]);
        saveMessage = `发布成功：${product.name}（后端已返回成功；复查列表失败：${apiErrorMessage(verifyError)}）`;
      }
    } catch (error) {
      product = {
        id: `local-${Date.now()}`,
        ...payload,
        score: 4.5,
        views: 0,
        createdAt: new Date().toISOString(),
        localOnly: true
      };
      rememberLocalProduct(product);
      state.products = mergeProducts([product, ...state.products]);
      saveMessage = `接口保存失败，已临时保存在本机：${product.name}。刷新本机仍可见，换设备不可见。原因：${apiErrorMessage(error)}`;
    }

    showAllMarketTab();
    renderMarketProducts("all");
    renderSearchResults(state.products.slice(0, 4));
    $("saveStatus").textContent = saveMessage;
    location.hash = "market";
  } finally {
    $("publishProductBtn").disabled = false;
    $("publishProductBtn").textContent = "发布商品";
  }
}

function selectProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  $("previewImage").src = product.image;
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
  $("searchResults").innerHTML = products
    .map(
      (item) => `
        <article class="result-card" data-id="${escapeText(item.id)}">
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

async function getUploadImageSrc(imageId) {
  if (state.uploads[imageId]) {
    try {
      return await state.uploads[imageId];
    } catch {
      // Fall back to the current preview if the browser cannot decode the file.
    }
  }
  return $(imageId).dataset.uploadDataUrl || $(imageId).src;
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
  const [categories, transactions, productsResponse, usersResponse, risks] = await Promise.all([
    getJson("/data/category-knowledge.json"),
    getJson("/data/market-transactions.json"),
    getJson("/api/products"),
    getJson("/api/users"),
    getJson("/data/risk-rules.json")
  ]);
  state.categories = categories;
  state.transactions = transactions;
  state.products = mergeProducts(productsResponse.data || []);
  state.users = usersResponse.data || [];
  state.risks = risks;

  populateCategorySelects();
  const savedUserId = localStorage.getItem("campusLoopUserId");
  state.currentUser = state.users.find((user) => user.id === savedUserId) || null;
  if (state.currentUser) {
    $("loginNameInput").value = state.currentUser.name;
    $("loginCampusInput").value = state.currentUser.campus;
  }

  renderCurrentUser();
  setupEvents();
  renderMarketProducts();
  renderSearchResults(state.products.slice(0, 4));
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
});
