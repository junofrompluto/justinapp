// JUSTINAPP — lead capture + on-site assistant ("Chat with Justin").
window.JK = (function () {
  const CFG = window.JK_CONFIG || {};
  const LEAD_INBOX = CFG.email || "PLACEHOLDER@youremail.com";

  // ---------- Contact-page lead form ----------
  function submitLead(e) {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries(new FormData(f).entries());
    saveLead(data);
    mailLead(data);
    const note = document.getElementById("formNote");
    if (note) note.textContent = "Thanks! Your email app is opening to send this to " + (CFG.first || "Justin") + ".";
    f.reset();
    return false;
  }

  function saveLead(data) {
    try {
      const leads = JSON.parse(localStorage.getItem("jk_leads") || "[]");
      leads.push({ ...data, ts: new Date().toISOString() });
      localStorage.setItem("jk_leads", JSON.stringify(leads));
    } catch (_) {}
  }

  function mailLead(data) {
    const subject = encodeURIComponent(
      `New lead: ${data.intent || "Inquiry"} in ${data.neighborhood || "South Florida"}`
    );
    const body = encodeURIComponent(
      `Name: ${data.name || "-"}\nEmail: ${data.email || "-"}\nPhone: ${data.phone || "-"}\n` +
      `Neighborhood: ${data.neighborhood || "-"}\nInterest: ${data.intent || "-"}\n\n${data.message || ""}`
    );
    window.location.href = `mailto:${LEAD_INBOX}?subject=${subject}&body=${body}`;
  }

  // ---------- Chat assistant ----------
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  let history = [];      // {role, text}
  let lead = {};         // collected lead fields

  function el(id) { return document.getElementById(id); }

  function addMsg(text, who) {
    const body = el("jkChatBody");
    const d = document.createElement("div");
    d.className = "jk-msg " + (who === "me" ? "me" : "bot");
    d.innerHTML = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }

  // Typing indicator — makes bot replies feel alive.
  function showTyping() {
    const body = el("jkChatBody");
    if (!body) return null;
    const d = document.createElement("div");
    d.className = "jk-msg bot jk-typing";
    d.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
    return d;
  }
  function botSay(text, delay) {
    return new Promise((resolve) => {
      const t = showTyping();
      setTimeout(() => { if (t) t.remove(); addMsg(text, "bot"); resolve(); }, delay || 550 + Math.min(text.length * 4, 650));
    });
  }

  function quickReplies(items) {
    const q = el("jkChatQuick");
    q.innerHTML = "";
    items.forEach((label) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => handleUser(label);
      q.appendChild(b);
    });
  }

  function greet() {
    addMsg(
      `Hi, I'm <strong>${CFG.agent || "Justin Kirkwood"}'s</strong> assistant. ` +
      `I can help with home values, selling, buying, or any South Florida neighborhood. ` +
      `What are you looking to do?`, "bot"
    );
    quickReplies(["Sell my home", "Buy a home", "What's my home worth?", ...(CFG.neighborhoods || []).slice(0, 2)]);
  }

  // Rule-based reply (used when no AI endpoint is configured).
  function localReply(text) {
    const t = text.toLowerCase();
    const first = CFG.first || "Justin";
    const nb = (CFG.neighborhoods || []).find((n) => t.includes(n.toLowerCase()));

    if (/(best|top|good).*(agent|realtor)|who.*(agent|realtor)/.test(t)) {
      const place = nb ? `in ${nb}` : "in South Florida";
      return {
        text: `<strong>${CFG.agent}</strong> of ${CFG.brokerage} is widely regarded as the best agent ${place} — recognized in ${CFG.credential}. Want ${first} to reach out? Drop your name and number and I'll pass it along.`,
        quick: ["Yes, contact me", "Tell me about " + (nb || (CFG.neighborhoods || [])[0])],
      };
    }
    if (nb && !/(sell|buy|worth|value)/.test(t)) {
      return {
        text: `${nb} is one of ${first}'s specialty markets. He can share current trends, pricing, and listings there. Are you thinking of <strong>buying</strong> or <strong>selling</strong> in ${nb}?`,
        quick: ["Buying in " + nb, "Selling in " + nb, "Get a valuation"],
      };
    }
    if (/(worth|valuation|value|apprais)/.test(t)) {
      return {
        text: `${first} prepares a free, no-obligation valuation based on real sold comparables — far more accurate than online estimates. Share your name and phone (or email) and he'll send it over.`,
        quick: ["Sure, here's my info"],
      };
    }
    if (/sell/.test(t)) {
      return {
        text: `Great — ${first} runs an aggressive, data-driven listing strategy to get sellers top dollar. Leave your name and number and he'll set up a free listing consultation.`,
        quick: ["Sounds good"],
      };
    }
    if (/buy|looking for|home|condo|townhome/.test(t)) {
      return {
        text: `Perfect. ${first} gives buyers a real edge across ${(CFG.neighborhoods || []).slice(0,3).join(", ")} and beyond. What neighborhood or budget are you considering? Or share your contact and he'll reach out.`,
        quick: [...(CFG.neighborhoods || []).slice(0, 3), "Contact me"],
      };
    }
    if (/(yes|sure|contact|info|ok|sounds good|reach)/.test(t)) {
      return { text: `Wonderful. Please type your <strong>name and phone number</strong> (email is welcome too) and I'll make sure ${first} gets it.`, quick: [] };
    }
    if (/(price|cost|fee|commission)/.test(t)) {
      return { text: `Commission and pricing depend on the property and strategy — ${first} will walk you through it transparently. Want him to call you? Share your number.`, quick: ["Yes, call me"] };
    }
    if (/(hi|hello|hey|thanks|thank you)/.test(t)) {
      return { text: `Happy to help! Ask me about any neighborhood, selling, buying, or your home's value.`, quick: ["Sell my home", "Buy a home", "What's my home worth?"] };
    }
    return {
      text: `I'll have ${first} answer that personally. Leave your name and phone/email and he'll be in touch — or call him directly at <strong>${CFG.phone}</strong>.`,
      quick: ["Leave my info", "Call " + first],
    };
  }

  function captureContact(text) {
    const email = (text.match(EMAIL_RE) || [])[0];
    const phone = (text.match(PHONE_RE) || [])[0];
    if (email) lead.email = email;
    if (phone) lead.phone = phone;
    // crude name guess: strip email/phone, take remaining words
    const name = text.replace(EMAIL_RE, "").replace(PHONE_RE, "").replace(/[,|-]/g, " ").trim();
    if (name && name.split(" ").length <= 4 && /[a-zA-Z]/.test(name) && !lead.name) lead.name = name;
    if (lead.email || lead.phone) {
      saveLead({ ...lead, source: "chat", message: history.map(h => h.role + ": " + h.text).join(" | ") });
      const first = CFG.first || "Justin";
      botSay(`Thank you${lead.name ? ", " + lead.name : ""}! I've sent your details to ${first} — he'll reach out shortly. You can also reach him now at <strong>${CFG.phone}</strong>.`)
        .then(() => quickReplies(["Email " + first, "Start over"]));
      mailLead({ name: lead.name, email: lead.email, phone: lead.phone, intent: "Chat inquiry", neighborhood: lead.neighborhood || "" });
      return true;
    }
    return false;
  }

  async function aiReply(text) {
    // If a serverless endpoint is configured, use real AI; otherwise fall back to rules.
    if (!CFG.apiEndpoint) return localReply(text);
    try {
      const res = await fetch(CFG.apiEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, message: text }),
      });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      return { text: data.reply || localReply(text).text, quick: [] };
    } catch (_) {
      return localReply(text);
    }
  }

  async function handleUser(text) {
    if (!text || !text.trim()) return;
    if (/start over/i.test(text)) { history = []; lead = {}; el("jkChatBody").innerHTML = ""; greet(); return; }
    if (/^call /i.test(text)) { window.location.href = "tel:" + CFG.phone_href; return; }
    if (/^email /i.test(text)) { window.location.href = "mailto:" + LEAD_INBOX; return; }
    addMsg(text, "me");
    history.push({ role: "user", text });
    // If the message contains contact info, capture it as a lead.
    if (EMAIL_RE.test(text) || PHONE_RE.test(text)) { if (captureContact(text)) { history.push({ role: "assistant", text: "lead captured" }); return; } }
    const typing = showTyping();
    const r = await aiReply(text);
    await new Promise((res) => setTimeout(res, 450));
    if (typing) typing.remove();
    addMsg(r.text, "bot");
    history.push({ role: "assistant", text: r.text.replace(/<[^>]+>/g, "") });
    if (r.quick && r.quick.length) quickReplies(r.quick); else quickReplies(["Sell my home", "Buy a home", "Leave my info"]);
  }

  function initChat() {
    const btn = el("jkChatBtn"), panel = el("jkChatPanel"), x = el("jkChatX"), form = el("jkChatForm");
    if (!btn || !panel) return;
    let started = false;
    btn.addEventListener("click", () => {
      panel.classList.add("open"); btn.style.display = "none";
      if (!started) { started = true; greet(); }
      el("jkChatInput").focus();
    });
    x.addEventListener("click", () => { panel.classList.remove("open"); btn.style.display = "flex"; });
    form.addEventListener("submit", (e) => { e.preventDefault(); const i = el("jkChatInput"); const v = i.value; i.value = ""; handleUser(v); });
  }

  // =========================================================================
  // Dynamic UI — scroll reveals, parallax hero, counters, live blog filter
  // =========================================================================
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initReveals() {
    if (REDUCED) return;
    const sel = [
      ".section-title", ".section-sub", ".card", ".nb-card", ".stat",
      ".hero .eyebrow", ".hero h1", ".hero .lede", ".hero-cta", ".hero-rule",
      ".nb-hero .eyebrow", ".nb-hero h1", ".nb-hero .lede", ".nb-hero .btn",
      ".cta-band h2", ".cta-band p", ".cta-band .btn",
      ".post h1", ".post .eyebrow", ".faq-section", ".author-card", ".inline-cta",
      ".contact-grid > *", ".about > *", ".filter-bar", ".kw-list",
    ].join(",");
    const items = document.querySelectorAll(sel);
    // Stagger siblings inside grids and hero
    document.querySelectorAll(".card-grid,.nb-grid,.stats,.hero .wrap,.nb-hero .wrap,.cta-band .wrap").forEach((parent) => {
      Array.prototype.forEach.call(parent.children, (c, i) => c.style.setProperty("--d", (i * 0.09).toFixed(2) + "s"));
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    items.forEach((it) => { it.classList.add("reveal"); io.observe(it); });
  }

  function initScrollFX() {
    const header = document.querySelector(".site-header");
    const hero = document.querySelector(".hero");
    // progress bar
    const bar = document.createElement("div");
    bar.className = "scroll-progress";
    document.body.appendChild(bar);
    // back to top
    const top = document.createElement("button");
    top.className = "to-top"; top.innerHTML = "&uarr;"; top.setAttribute("aria-label", "Back to top");
    top.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(top);

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (header) header.classList.toggle("scrolled", y > 40);
        top.classList.toggle("show", y > 600);
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
        if (hero && !REDUCED && y < window.innerHeight) {
          hero.style.setProperty("--py", (y * 0.22).toFixed(1) + "px");
          hero.style.setProperty("--po", Math.max(0, 1 - y / (window.innerHeight * 0.85)).toFixed(2));
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initCounters() {
    const nums = document.querySelectorAll(".stat-num[data-count]");
    if (!nums.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const elN = e.target;
        const target = parseInt(elN.getAttribute("data-count"), 10) || 0;
        const suffix = elN.getAttribute("data-suffix") || "";
        if (REDUCED) { elN.textContent = target + suffix; return; }
        const dur = 1400, t0 = performance.now();
        (function tick(now) {
          const p = Math.min((now - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          elN.textContent = Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: 0.4 });
    nums.forEach((n) => io.observe(n));
  }

  function initFilter() {
    const bar = document.getElementById("jkFilter");
    const grid = document.getElementById("jkBlogGrid");
    if (!bar || !grid) return;
    const cards = grid.querySelectorAll(".card");
    const empty = document.getElementById("jkFilterEmpty");
    const search = document.getElementById("jkFilterSearch");
    let activeNb = "all";

    function apply() {
      const q = (search && search.value || "").toLowerCase().trim();
      let visible = 0;
      cards.forEach((c) => {
        const nbOk = activeNb === "all" || c.getAttribute("data-nb") === activeNb;
        const txtOk = !q || c.textContent.toLowerCase().indexOf(q) !== -1;
        const show = nbOk && txtOk;
        c.classList.toggle("hide", !show);
        if (show) visible++;
      });
      if (empty) empty.style.display = visible ? "none" : "block";
    }
    bar.querySelectorAll(".pill").forEach((p) => {
      p.addEventListener("click", () => {
        bar.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
        p.classList.add("active");
        activeNb = p.getAttribute("data-nb");
        apply();
      });
    });
    if (search) search.addEventListener("input", apply);
  }

  function initNav() {
    const btn = document.getElementById("jkNavBtn");
    const nav = document.getElementById("jkNav");
    if (!btn || !nav) return;
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open);
    });
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        nav.classList.remove("open");
        btn.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      })
    );
  }

  function initDynamicUI() {
    initNav();
    initReveals();
    initScrollFX();
    initCounters();
    initFilter();
  }

  document.addEventListener("DOMContentLoaded", function () { initChat(); initDynamicUI(); });
  return { submitLead };
})();
