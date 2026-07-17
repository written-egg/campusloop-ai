(function exposeSearchMatching(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SearchMatching = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSearchMatching() {
  const categoryNames = new Set(["数码电子", "运动户外", "生活用品", "图书教材", "校园交通", "服饰鞋包", "乐器音频", "美妆个护", "其他", "不限"]);

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function cleanFragment(value) {
    return normalize(value)
      .replace(/\d+(?:\.\d+)?\s*(?:元|块)?/g, " ")
      .replace(/(?:我想要|我想买|适合|新手|入门|想要|求购|购买|推荐|二手|校园|同校|预算|价格|以内|以下|左右|不超过|一个|一台|一部|一双|一件|商品)/g, " ")
      .replace(/^[\s的找要买]+|[\s的]+$/g, "")
      .replace(/\s+/g, " ");
  }

  function extractSearchTerms(query, intent = {}) {
    const fragments = [query, ...(Array.isArray(intent.keywords) ? intent.keywords : [])]
      .flatMap((value) => String(value || "").split(/[，,。；;、\s]+/))
      .map(cleanFragment)
      .filter((term) => term.length >= 2 && !/^\d+$/.test(term) && !categoryNames.has(term));
    return [...new Set(fragments)].slice(0, 8);
  }

  function productText(item) {
    return {
      name: normalize(item.name),
      tags: normalize((item.tags || []).join(" ")),
      description: normalize(item.description)
    };
  }

  function rankProducts(query, intent = {}, products = []) {
    const terms = extractSearchTerms(query, intent);
    const categoryIntent = normalize(intent.categoryIntent);
    const budget = Number(intent.budgetHint) > 0 ? Number(intent.budgetHint) : null;
    const exactMatches = [];
    const similarRecommendations = [];

    products.forEach((item) => {
      if (item.status && item.status !== "on_sale") return;
      const text = productText(item);
      const matchedTerms = terms.filter((term) => text.name.includes(term) || text.tags.includes(term) || text.description.includes(term));
      const categoryMatch = categoryIntent && categoryIntent !== "不限" && normalize(item.category).includes(categoryIntent);
      const withinBudget = !budget || Number(item.price) <= budget;
      let score = 0;

      matchedTerms.forEach((term) => {
        if (text.name.includes(term)) score += 10;
        else if (text.tags.includes(term)) score += 6;
        else score += 3;
      });
      if (categoryMatch) score += 2;
      if (budget && withinBudget) score += 2;

      const ranked = { ...item, matchScore: score, matchedTerms };
      if (matchedTerms.length && withinBudget) {
        ranked.matchReason = `命中：${matchedTerms.join("、")}${budget ? " · 符合预算" : ""}`;
        exactMatches.push(ranked);
      } else if (categoryMatch && withinBudget) {
        ranked.matchReason = `${item.category}同品类${budget ? " · 符合预算" : ""}`;
        similarRecommendations.push(ranked);
      }
    });

    exactMatches.sort((a, b) => b.matchScore - a.matchScore || Number(a.price) - Number(b.price));
    similarRecommendations.sort((a, b) => Number(b.trust || 0) - Number(a.trust || 0) || Number(a.price) - Number(b.price));
    return { terms, exactMatches, similarRecommendations };
  }

  return { extractSearchTerms, rankProducts };
});
