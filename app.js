(() => {
  "use strict";

  const config = window.SITE_CONFIG || {};
  const byId = (id) => document.getElementById(id);
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const list = (value) => Array.isArray(value) ? value : [];
  const lower = (value) => text(value).toLocaleLowerCase();
  const stored = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch { /* Storage is optional. */ }
    },
  };

  function externalUrl(value) {
    try {
      const url = new URL(text(value));
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
        ? url.href : "";
    } catch { return ""; }
  }

  function link(element, value) {
    const url = externalUrl(value);
    element.hidden = !url;
    if (url) {
      element.href = url;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    } else {
      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
    }
    return element;
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  const name = text(config.name) || "我的项目空间";
  byId("site-name").textContent = name;
  byId("footer-name").textContent = name;
  document.title = `${name} · Projects & Explorations`;
  for (const [id, value] of [
    ["intro", config.intro], ["about-text", config.about],
    ["about-secondary", config.aboutSecondary],
  ]) {
    if (typeof value === "string") byId(id).textContent = value.trim();
  }
  const description = document.querySelector('meta[name="description"]');
  if (description && text(config.intro)) {
    description.content = text(config.intro).replace(/\s+/g, " ");
  }

  const rawUsername = text(config.githubUsername);
  const username = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(rawUsername)
    ? rawUsername : "";
  const githubUrl = username ? `https://github.com/${encodeURIComponent(username)}` : "";
  ["header-github", "about-github"].forEach((id) => link(byId(id), githubUrl));
  link(byId("all-repositories"), githubUrl ? `${githubUrl}?tab=repositories` : "");
  const email = text(config.email);
  const emailLink = byId("contact-email");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailLink.href = `mailto:${encodeURIComponent(email)}`;
    emailLink.hidden = false;
  } else {
    emailLink.hidden = true;
    emailLink.removeAttribute("href");
  }

  const themeKey = "project-space:theme";
  const savedTheme = stored.get(themeKey);
  let explicitTheme = ["light", "dark"].includes(savedTheme) ? savedTheme : "";
  const systemTheme = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const themeButton = byId("theme-toggle");
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeButton.setAttribute("aria-label", `切换到${theme === "dark" ? "浅" : "深"}色模式`);
    themeButton.setAttribute("aria-pressed", String(theme === "dark"));
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = theme === "dark" ? "#1b1e1b" : "#f5f3ed";
  }
  applyTheme(explicitTheme || (systemTheme?.matches ? "dark" : "light"));
  themeButton.addEventListener("click", () => {
    explicitTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(explicitTheme);
    stored.set(themeKey, explicitTheme);
  });
  systemTheme?.addEventListener?.("change", (event) => {
    if (!explicitTheme) applyTheme(event.matches ? "dark" : "light");
  });

  const featuredNames = list(config.featuredRepositories).map(lower).filter(Boolean);
  const excludedNames = new Set(list(config.excludedRepositories).map(lower).filter(Boolean));
  const state = { projects: [], filter: "all", query: "", language: "", notice: "" };
  const grid = byId("project-grid");
  const search = byId("project-search");
  const languageSelect = byId("language-filter");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];

  function normalizeProject(raw, base = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const choose = (key) => typeof raw[key] === "string" ? text(raw[key]) : text(base[key]);
    const projectName = choose("name");
    if (!projectName) return null;
    const project = {
      name: projectName,
      fullName: choose("fullName"),
      description: choose("description"),
      url: externalUrl(choose("url")),
      demo: externalUrl(choose("demo")),
      language: choose("language") || "未标注",
      topics: [...new Set(list(Array.isArray(raw.topics) ? raw.topics : base.topics)
        .map(text).filter(Boolean))],
      updatedAt: choose("updatedAt"),
      featured: typeof raw.featured === "boolean" ? raw.featured : Boolean(base.featured),
    };
    const identities = [lower(project.name), lower(project.fullName)];
    if (identities.some((identity) => excludedNames.has(identity))) return null;
    project.featuredRank = featuredNames.findIndex((entry) => identities.includes(entry));
    project.featured = project.featured || project.featuredRank !== -1;
    return project;
  }

  function githubProject(repo) {
    if (!repo || typeof repo !== "object" || repo.private === true) return null;
    const repoName = lower(repo.name);
    if ((!config.includeForks && repo.fork) || (!config.includeArchived && repo.archived)
      || repoName === lower(username) || repoName === `${lower(username)}.github.io`) return null;
    return normalizeProject({
      name: repo.name, fullName: repo.full_name, description: repo.description,
      url: repo.html_url, demo: repo.homepage, language: repo.language,
      topics: repo.topics, updatedAt: repo.pushed_at || repo.updated_at,
    });
  }

  function combineProjects(repositories) {
    const combined = new Map();
    for (const repo of repositories) {
      const project = githubProject(repo);
      if (project) combined.set(lower(project.name), project);
    }
    for (const raw of list(config.projects)) {
      const key = lower(raw?.name);
      const project = normalizeProject(raw, combined.get(key));
      if (project) combined.set(key, project);
    }
    return [...combined.values()].sort((a, b) => {
      if (a.featured !== b.featured) return Number(b.featured) - Number(a.featured);
      const rankA = a.featuredRank < 0 ? Infinity : a.featuredRank;
      const rankB = b.featuredRank < 0 ? Infinity : b.featuredRank;
      if (rankA !== rankB) return rankA - rankB;
      return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    });
  }

  function projectCard(project) {
    const card = element("article", "project-card");
    const top = element("div", "card-top");
    const symbol = element("span", "project-symbol", "{ }");
    symbol.setAttribute("aria-hidden", "true");
    top.append(symbol);
    if (project.featured) top.append(element("span", "featured-label", "精选项目"));
    const title = element("h3");
    if (project.url) title.append(link(element("a", "", project.name), project.url));
    else title.textContent = project.name;
    const descriptionNode = element("p", "", project.description || "暂无项目介绍。");
    const tags = element("div", "tags");
    project.topics.slice(0, 4).forEach((topic) => tags.append(element("span", "tag", topic)));
    const bottom = element("div", "card-bottom");
    bottom.append(element("span", "card-language", project.language));
    const links = element("div", "card-links");
    if (project.url) {
      const source = link(element("a", "", "查看项目 ↗"), project.url);
      source.setAttribute("aria-label", `查看项目：${project.name}（新窗口）`);
      links.append(source);
    }
    if (project.demo && project.demo !== project.url) {
      const demo = link(element("a", "", "在线体验 ↗"), project.demo);
      demo.setAttribute("aria-label", `在线体验：${project.name}（新窗口）`);
      links.append(demo);
    }
    bottom.append(links);
    card.append(top, title, descriptionNode, tags, bottom);
    return card;
  }

  function render() {
    const keywords = lower(state.query).split(/\s+/).filter(Boolean);
    const visible = state.projects.filter((project) => {
      if (state.filter === "featured" && !project.featured) return false;
      if (state.language && project.language !== state.language) return false;
      const searchable = [project.name, project.fullName, project.description,
        project.language, ...project.topics].join(" ").toLocaleLowerCase();
      return keywords.every((keyword) => searchable.includes(keyword));
    });
    const fragment = document.createDocumentFragment();
    visible.forEach((project) => fragment.append(projectCard(project)));
    grid.replaceChildren(fragment);
    const hasProjects = state.projects.length > 0;
    byId("project-tools").hidden = !hasProjects;
    byId("empty-state").hidden = hasProjects;
    byId("no-results").hidden = !hasProjects || visible.length > 0;
    byId("total-count").textContent = String(state.projects.length);
    byId("collection-caption").textContent = hasProjects
      ? `${state.projects.length} PROJECTS · ALWAYS IN PROGRESS.`
      : "A COLLECTION, ALWAYS IN PROGRESS.";
    const filtering = keywords.length || state.language || state.filter !== "all";
    const resultNotice = hasProjects && filtering ? `找到 ${visible.length} 个匹配项目。` : "";
    byId("project-status").textContent = [state.notice, resultNotice].filter(Boolean).join(" ");
    filterButtons.forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setProjects(repositories) {
    state.projects = combineProjects(repositories);
    const languages = [...new Set(state.projects.map((project) => project.language))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
    const placeholder = element("option", "", "所有语言");
    placeholder.value = "";
    languageSelect.replaceChildren(placeholder);
    languages.forEach((language) => {
      const option = element("option", "", language);
      option.value = language;
      languageSelect.append(option);
    });
    if (!languages.includes(state.language)) state.language = "";
    languageSelect.value = state.language;
    render();
  }

  filterButtons.forEach((button) => button.addEventListener("click", () => {
    state.filter = button.dataset.filter === "featured" ? "featured" : "all";
    render();
  }));
  search.addEventListener("input", () => { state.query = search.value; render(); });
  languageSelect.addEventListener("change", () => {
    state.language = languageSelect.value;
    render();
  });
  byId("reset-filters").addEventListener("click", () => {
    state.filter = "all";
    state.query = "";
    state.language = "";
    search.value = "";
    languageSelect.value = "";
    render();
    search.focus();
  });

  const cacheKey = `project-space:github:${lower(username)}:v1`;
  const cacheLifetime = 10 * 60 * 1000;
  function cachedRepositories() {
    try {
      const cached = JSON.parse(stored.get(cacheKey));
      const age = Date.now() - cached.timestamp;
      return Number.isFinite(age) && age >= 0 && age < cacheLifetime
        && Array.isArray(cached.repositories) ? cached.repositories : null;
    } catch { return null; }
  }

  async function fetchRepositories() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const repositories = [];
    try {
      for (let page = 1; ; page += 1) {
        const apiUrl = `https://api.github.com/users/${encodeURIComponent(username)}/repos`
          + `?type=owner&sort=updated&direction=desc&per_page=100&page=${page}`;
        const response = await fetch(apiUrl, {
          signal: controller.signal,
          credentials: "omit",
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) {
          const error = new Error("Unable to load public projects");
          error.status = response.status;
          throw error;
        }
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error("Unexpected project response");
        repositories.push(...batch);
        const pagination = response.headers.get("link");
        const hasNext = pagination ? /;\s*rel="next"/.test(pagination) : batch.length === 100;
        if (!hasNext || batch.length === 0) break;
      }
      return repositories;
    } finally { window.clearTimeout(timeout); }
  }

  async function loadProjects() {
    setProjects([]);
    if (!username || config.autoLoadGithub === false) {
      if (rawUsername && !username) {
        state.notice = "GitHub 用户名暂时无法识别，请检查主页中的用户名设置。";
        render();
      }
      return;
    }
    const cached = cachedRepositories();
    if (cached) { setProjects(cached); return; }
    state.notice = "正在整理公开项目…";
    grid.setAttribute("aria-busy", "true");
    render();
    try {
      const repositories = await fetchRepositories();
      stored.set(cacheKey, JSON.stringify({ timestamp: Date.now(), repositories }));
      state.notice = "";
      setProjects(repositories);
    } catch (error) {
      const reason = error.name === "AbortError" ? "GitHub 项目加载超时。"
        : [403, 429].includes(error.status) ? "GitHub 访问暂时受限。"
        : error.status === 404 ? "暂时未找到这个 GitHub 用户的公开项目。"
        : "GitHub 项目暂时未能载入。";
      state.notice = reason + (state.projects.length ? "已保留手动整理的项目，稍后刷新页面可重试。"
        : "稍后刷新页面可重试。");
      render();
    } finally { grid.setAttribute("aria-busy", "false"); }
  }

  void loadProjects();
})();
