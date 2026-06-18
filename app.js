const STORAGE_KEY = "wedding-auction-state-v1";
const SHARE_KEY = "wedding-auction-share-url";
const ADMIN_SESSION_KEY = "wedding-auction-admin-unlocked";
const ADMIN_PASSWORD_HASH = "955239c07133bb3f948cb4955a9c661dc32ed0565e78c24754148a746b56abae";

const demoItems = [
  {
    id: crypto.randomUUID(),
    name: "Premier toast des maries",
    category: "Souvenir",
    description: "Une bouteille gardee pour trinquer avec les maries lors d'un prochain diner.",
    startPrice: 25,
    step: 5,
    image: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=75",
    bids: [{ bidder: "Marie", amount: 45, at: Date.now() - 300000 }]
  },
  {
    id: crypto.randomUUID(),
    name: "Cours de danse improvise",
    category: "Experience",
    description: "Les temoins offrent trente minutes de danse, bonne humeur incluse.",
    startPrice: 15,
    step: 5,
    image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=75",
    bids: []
  },
  {
    id: crypto.randomUUID(),
    name: "Panier douceur du lendemain",
    category: "Gourmandise",
    description: "Cafe, biscuits, confiture et petites attentions pour prolonger la fete.",
    startPrice: 20,
    step: 5,
    image: "https://images.unsplash.com/photo-1481391319762-47dff72954d9?auto=format&fit=crop&w=900&q=75",
    bids: [{ bidder: "Lucas", amount: 30, at: Date.now() - 120000 }]
  }
];

let state = loadState();
let deferredInstallPrompt = null;

const itemGrid = document.querySelector("#itemGrid");
const itemTemplate = document.querySelector("#itemTemplate");
const itemForm = document.querySelector("#itemForm");
const searchInput = document.querySelector("#searchInput");
const toast = document.querySelector("#toast");
const shareUrl = document.querySelector("#shareUrl");
const qrImage = document.querySelector("#qrImage");
const qrCaption = document.querySelector("#qrCaption");
const installButton = document.querySelector("#installButton");
const adminLock = document.querySelector("#adminLock");
const adminPanel = document.querySelector("#adminPanel");
const adminLoginForm = document.querySelector("#adminLoginForm");
const lockAdminButton = document.querySelector("#lockAdminButton");

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

searchInput.addEventListener("input", render);

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(adminLoginForm).get("password");
  const passwordHash = await sha256(password);
  if (passwordHash !== ADMIN_PASSWORD_HASH) {
    showToast("Mot de passe incorrect.");
    adminLoginForm.reset();
    return;
  }
  sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
  adminLoginForm.reset();
  renderAdminAccess();
  render();
  showToast("Espace admin deverrouille.");
});

lockAdminButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  renderAdminAccess();
  render();
  showToast("Espace admin verrouille.");
});

itemForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isAdminUnlocked()) {
    showToast("Deverrouille l'espace admin avant d'ajouter un objet.");
    return;
  }
  const formData = new FormData(itemForm);
  const item = {
    id: crypto.randomUUID(),
    name: formData.get("name").trim(),
    category: formData.get("category").trim(),
    description: formData.get("description").trim(),
    startPrice: Number(formData.get("startPrice")),
    step: Number(formData.get("step")),
    image: formData.get("image").trim(),
    bids: []
  };
  state.items.unshift(item);
  saveState();
  itemForm.reset();
  itemForm.elements.startPrice.value = 20;
  itemForm.elements.step.value = 5;
  render();
  showToast("Objet ajoute au catalogue.");
});

document.querySelector("#resetDemoButton").addEventListener("click", () => {
  if (!isAdminUnlocked()) return;
  state = { items: structuredClone(demoItems) };
  saveState();
  render();
  showToast("Catalogue d'exemple recharge.");
});

document.querySelector("#exportButton").addEventListener("click", () => {
  if (!isAdminUnlocked()) return;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "encheres-mariage.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#importInput").addEventListener("change", async (event) => {
  if (!isAdminUnlocked()) return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.items)) throw new Error("Format invalide");
    state = imported;
    saveState();
    render();
    showToast("Donnees importees.");
  } catch {
    showToast("Impossible d'importer ce fichier.");
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#saveShareUrl").addEventListener("click", () => {
  const url = shareUrl.value.trim() || window.location.href;
  localStorage.setItem(SHARE_KEY, url);
  renderQr(url);
  showToast("QR code genere.");
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { items: structuredClone(demoItems) };
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed.items) ? parsed : { items: structuredClone(demoItems) };
  } catch {
    return { items: structuredClone(demoItems) };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setView(viewId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const items = state.items.filter((item) => {
    return [item.name, item.category, item.description, getLeader(item)?.bidder]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });

  itemGrid.replaceChildren(...items.map(createItemCard));
  document.querySelector("#itemCount").textContent = state.items.length;
  document.querySelector("#bidCount").textContent = state.items.reduce((sum, item) => sum + item.bids.length, 0);
  document.querySelector("#totalRaised").textContent = formatCurrency(
    state.items.reduce((sum, item) => sum + getCurrentBid(item), 0)
  );

  const storedShareUrl = localStorage.getItem(SHARE_KEY) || window.location.href;
  shareUrl.value = storedShareUrl;
  renderQr(storedShareUrl);
  renderAdminAccess();
}

function createItemCard(item) {
  const card = itemTemplate.content.firstElementChild.cloneNode(true);
  const currentBid = getCurrentBid(item);
  const minimumBid = currentBid + item.step;
  const leader = getLeader(item);

  card.querySelector(".lot-media").style.setProperty("--image", item.image ? `url("${item.image}")` : "");
  card.querySelector(".lot-category").textContent = item.category;
  card.querySelector("h3").textContent = item.name;
  card.querySelector(".lot-description").textContent = item.description;
  card.querySelector(".current-bid").textContent = formatCurrency(currentBid);
  card.querySelector(".leader").textContent = leader ? `Meilleure offre : ${leader.bidder}` : "Aucune enchere";
  card.querySelector('input[name="amount"]').value = minimumBid;
  card.querySelector('input[name="amount"]').min = minimumBid;

  const deleteButton = card.querySelector(".delete-button");
  deleteButton.hidden = !isAdminUnlocked();
  deleteButton.addEventListener("click", () => {
    if (!isAdminUnlocked()) {
      showToast("Suppression reservee aux organisateurs.");
      return;
    }
    state.items = state.items.filter((candidate) => candidate.id !== item.id);
    saveState();
    render();
    showToast("Objet supprime.");
  });

  card.querySelector(".bid-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const bidder = formData.get("bidder").trim();
    const amount = Number(formData.get("amount"));
    if (amount < minimumBid) {
      showToast(`La prochaine mise doit etre au moins ${formatCurrency(minimumBid)}.`);
      return;
    }
    item.bids.push({ bidder, amount, at: Date.now() });
    saveState();
    render();
    showToast(`Merci ${bidder}, enchere enregistree.`);
  });

  return card;
}

function getLeader(item) {
  return [...item.bids].sort((a, b) => b.amount - a.amount || b.at - a.at)[0];
}

function getCurrentBid(item) {
  return getLeader(item)?.amount ?? item.startPrice;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function renderQr(url) {
  const encoded = encodeURIComponent(url);
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encoded}`;
  qrCaption.textContent = url;
}

function isAdminUnlocked() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
}

function renderAdminAccess() {
  const unlocked = isAdminUnlocked();
  adminLock.hidden = unlocked;
  adminPanel.hidden = !unlocked;
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

render();
