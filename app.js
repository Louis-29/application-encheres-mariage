const STORAGE_KEY = "wedding-auction-state-v1";
const SHARE_KEY = "wedding-auction-share-url";
const LOCAL_ADMIN_PASSWORD_HASH = "955239c07133bb3f948cb4955a9c661dc32ed0565e78c24754148a746b56abae";

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

let state = loadLocalState();
let deferredInstallPrompt = null;
let supabaseClient = null;
let realtimeChannel = null;
let isRemoteReady = false;
let adminUnlocked = false;
let adminPassword = "";

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
  const isValid = await verifyAdminPassword(password);
  if (!isValid) {
    showToast("Mot de passe incorrect.");
    adminLoginForm.reset();
    return;
  }
  adminUnlocked = true;
  adminPassword = password;
  adminLoginForm.reset();
  render();
  showToast("Espace admin deverrouille.");
});

lockAdminButton.addEventListener("click", () => {
  adminUnlocked = false;
  adminPassword = "";
  render();
  showToast("Espace admin verrouille.");
});

itemForm.addEventListener("submit", async (event) => {
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

  try {
    if (isRemoteReady) {
      await createRemoteItem(item);
    } else {
      state.items.unshift(item);
      saveLocalState();
      render();
    }
    itemForm.reset();
    itemForm.elements.startPrice.value = 20;
    itemForm.elements.step.value = 5;
    showToast("Objet ajoute au catalogue.");
  } catch (error) {
    showToast(error.message || "Impossible d'ajouter cet objet.");
  }
});

document.querySelector("#resetDemoButton").addEventListener("click", async () => {
  if (!isAdminUnlocked()) return;
  try {
    if (isRemoteReady) {
      await resetRemoteDemo();
    } else {
      state = { items: structuredClone(demoItems) };
      saveLocalState();
      render();
    }
    showToast("Catalogue d'exemple recharge.");
  } catch (error) {
    showToast(error.message || "Impossible de recharger l'exemple.");
  }
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
    if (isRemoteReady) {
      await importRemoteState(imported);
    } else {
      state = imported;
      saveLocalState();
      render();
    }
    showToast("Donnees importees.");
  } catch (error) {
    showToast(error.message || "Impossible d'importer ce fichier.");
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

function loadLocalState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return { items: structuredClone(demoItems) };
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed.items) ? parsed : { items: structuredClone(demoItems) };
  } catch {
    return { items: structuredClone(demoItems) };
  }
}

function saveLocalState() {
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
  deleteButton.addEventListener("click", async () => {
    if (!isAdminUnlocked()) {
      showToast("Suppression reservee aux organisateurs.");
      return;
    }
    try {
      if (isRemoteReady) {
        await deleteRemoteItem(item.id);
      } else {
        state.items = state.items.filter((candidate) => candidate.id !== item.id);
        saveLocalState();
        render();
      }
      showToast("Objet supprime.");
    } catch (error) {
      showToast(error.message || "Impossible de supprimer cet objet.");
    }
  });

  card.querySelector(".bid-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const bidder = formData.get("bidder").trim();
    const amount = Number(formData.get("amount"));
    if (amount < minimumBid) {
      showToast(`La prochaine mise doit etre au moins ${formatCurrency(minimumBid)}.`);
      return;
    }
    try {
      if (isRemoteReady) {
        await placeRemoteBid(item.id, bidder, amount);
      } else {
        item.bids.push({ bidder, amount, at: Date.now() });
        saveLocalState();
        render();
      }
      showToast(`Merci ${bidder}, enchere enregistree.`);
    } catch (error) {
      showToast(error.message || "Impossible d'enregistrer cette enchere.");
    }
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
  return adminUnlocked;
}

function getAdminPassword() {
  return adminPassword;
}

function renderAdminAccess() {
  const unlocked = isAdminUnlocked();
  adminLock.hidden = unlocked;
  adminPanel.hidden = !unlocked;
}

async function verifyAdminPassword(password) {
  if (!isRemoteReady) {
    return (await sha256(password)) === LOCAL_ADMIN_PASSWORD_HASH;
  }
  const { data, error } = await supabaseClient.rpc("verify_admin_password", {
    password_input: password
  });
  if (error) throw new Error("Verification admin impossible.");
  return data === true;
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function initSupabase() {
  const config = window.AUCTION_SUPABASE || {};
  const url = config.url || "";
  const anonKey = config.anonKey || "";
  const isConfigured = url.startsWith("https://") && anonKey.length > 40 && window.supabase;
  if (!isConfigured) {
    render();
    showToast("Mode local actif. Ajoute les cles Supabase pour le temps reel.");
    return;
  }

  supabaseClient = window.supabase.createClient(url, anonKey);
  isRemoteReady = true;
  await loadRemoteState();
  subscribeToRealtime();
  showToast("Synchronisation temps reel active.");
}

async function loadRemoteState() {
  const { data: items, error: itemsError } = await supabaseClient
    .from("auction_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (itemsError) throw new Error("Impossible de charger les objets.");

  const { data: bids, error: bidsError } = await supabaseClient
    .from("auction_bids")
    .select("*")
    .order("created_at", { ascending: true });
  if (bidsError) throw new Error("Impossible de charger les encheres.");

  state = {
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      startPrice: Number(item.start_price),
      step: Number(item.bid_step),
      image: item.image_url || "",
      bids: bids
        .filter((bid) => bid.item_id === item.id)
        .map((bid) => ({
          bidder: bid.bidder,
          amount: Number(bid.amount),
          at: new Date(bid.created_at).getTime()
        }))
    }))
  };
  render();
}

function subscribeToRealtime() {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient
    .channel("auction-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "auction_items" }, loadRemoteState)
    .on("postgres_changes", { event: "*", schema: "public", table: "auction_bids" }, loadRemoteState)
    .subscribe();
}

async function createRemoteItem(item) {
  const { error } = await supabaseClient.rpc("admin_create_item", {
    password_input: getAdminPassword(),
    item_name: item.name,
    item_category: item.category,
    item_description: item.description,
    item_start_price: item.startPrice,
    item_bid_step: item.step,
    item_image_url: item.image || null
  });
  if (error) throw new Error(error.message);
  await loadRemoteState();
}

async function deleteRemoteItem(itemId) {
  const { error } = await supabaseClient.rpc("admin_delete_item", {
    password_input: getAdminPassword(),
    item_id_input: itemId
  });
  if (error) throw new Error(error.message);
  await loadRemoteState();
}

async function resetRemoteDemo() {
  const { error } = await supabaseClient.rpc("admin_reset_demo", {
    password_input: getAdminPassword(),
    demo_items: demoItems.map(formatItemForImport)
  });
  if (error) throw new Error(error.message);
  await loadRemoteState();
}

async function importRemoteState(imported) {
  const { error } = await supabaseClient.rpc("admin_reset_demo", {
    password_input: getAdminPassword(),
    demo_items: imported.items.map(formatItemForImport)
  });
  if (error) throw new Error(error.message);
  await loadRemoteState();
}

function formatItemForImport(item) {
  return {
    name: item.name,
    category: item.category,
    description: item.description,
    start_price: item.startPrice,
    bid_step: item.step,
    image_url: item.image || "",
    bids: item.bids || []
  };
}

async function placeRemoteBid(itemId, bidder, amount) {
  const { error } = await supabaseClient.rpc("place_bid", {
    item_id_input: itemId,
    bidder_input: bidder,
    amount_input: amount
  });
  if (error) throw new Error(error.message);
  await loadRemoteState();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

render();
initSupabase().catch((error) => {
  isRemoteReady = false;
  render();
  showToast(error.message || "Mode local actif.");
});
