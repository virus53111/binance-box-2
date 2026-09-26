import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from "firebase/auth";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Ban,
  Bell,
  BriefcaseBusiness,
  Camera,
  Check,
  CircleUserRound,
  Download,
  ExternalLink,
  Hammer,
  Languages,
  LocateFixed,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import type { MapOrder } from "./MapPanel";
import { auth, db, googleProvider, OWNER_EMAIL } from "./firebase";

const MapPanel = lazy(() => import("./MapPanel"));

type Lang = "ru" | "lv" | "en" | "uk";
type Role = "customer" | "master";
type Profile = {
  displayName: string;
  phone: string;
  bio: string;
  services: string;
  city: string;
  role: Role;
  avatar?: string;
  email?: string;
  publicProfile?: boolean;
  alertCity?: string;
  alertKeywords?: string;
};
type Order = {
  id: string;
  category?: string;
  service: string;
  description: string;
  price: string;
  city: string;
  district: string;
  date: string;
  photo?: string;
  lat: number;
  lng: number;
  customerId: string;
  customerName: string;
  status: string;
  createdAt?: unknown;
};
type Chat = {
  id: string;
  orderId: string;
  orderTitle: string;
  participants: string[];
  customerId: string;
  masterId: string;
  updatedAt?: unknown;
};
type Message = {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt?: { toDate?: () => Date };
};
type SsLead = {
  id: string;
  category: string;
  title: string;
  url: string;
  foundAt: string;
};
type ExternalLead = {
  id: string;
  type: "task" | "helper";
  category: string;
  profession: string;
  title: string;
  city: string;
  url: string;
  source: string;
  foundAt: string;
};
type AdminUser = {
  id: string;
  displayName?: string;
  email?: string;
  role?: Role;
  blocked?: boolean;
  city?: string;
};
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Modal = "login" | "order" | "task" | "profile" | "admin" | "chats" | null;
const ui = {
  ru: {
    map: "Карта",
    orders: "Заявки",
    masters: "Помощники",
    search: "Что нужно сделать?",
    newOrder: "Создать заявку",
    roleC: "Мне нужна помощь",
    roleM: "Хочу помогать",
    headline: "Любая помощь рядом",
    sub: "Доставка, поручения, помощь по дому и другие задачи — найдите человека рядом",
    login: "Войти через Google",
    profile: "Профиль",
    chats: "Чаты",
    near: "Заявки рядом",
    respond: "Предложить помощь",
    myOrders: "Мои объявления",
    share: "Поделиться",
    invite: "Пригласить помощника",
  },
  lv: {
    map: "Karte",
    orders: "Pasūtījumi",
    masters: "Palīgi",
    search: "Kas jāizdara?",
    newOrder: "Izveidot pasūtījumu",
    roleC: "Man vajag palīdzību",
    roleM: "Vēlos palīdzēt",
    headline: "Jebkāda palīdzība tuvumā",
    sub: "Piegāde, uzdevumi, palīdzība mājās un citi darbi — atrodiet cilvēku tuvumā",
    login: "Turpināt ar Google",
    profile: "Profils",
    chats: "Čati",
    near: "Pasūtījumi tuvumā",
    respond: "Piedāvāt palīdzību",
    myOrders: "Mani sludinājumi",
    share: "Dalīties",
    invite: "Uzaicināt palīgu",
  },
  en: {
    map: "Map",
    orders: "Requests",
    masters: "Helpers",
    search: "What needs doing?",
    newOrder: "Post a request",
    roleC: "I need help",
    roleM: "I want to help",
    headline: "Any help nearby",
    sub: "Delivery, errands, home help and more — find someone nearby",
    login: "Continue with Google",
    profile: "Profile",
    chats: "Chats",
    near: "Requests nearby",
    respond: "Offer help",
    myOrders: "My listings",
    share: "Share",
    invite: "Invite a helper",
  },
  uk: {
    map: "Карта",
    orders: "Заявки",
    masters: "Помічники",
    search: "Що потрібно зробити?",
    newOrder: "Створити заявку",
    roleC: "Мені потрібна допомога",
    roleM: "Хочу допомагати",
    headline: "Будь-яка допомога поруч",
    sub: "Доставка, доручення, допомога вдома та інші завдання",
    login: "Увійти через Google",
    profile: "Профіль",
    chats: "Чати",
    near: "Заявки поруч",
    respond: "Запропонувати допомогу",
    myOrders: "Мої оголошення",
    share: "Поділитися",
    invite: "Запросити помічника",
  },
};
const categories: Record<Lang, string[]> = {
  ru: ["Поручения", "Доставка", "Перевозка", "Помощь по дому", "Ремонт", "Уборка", "Животные", "Помощь пожилым", "Техника", "Другое"],
  lv: ["Uzdevumi", "Piegāde", "Pārvadāšana", "Palīdzība mājās", "Remonts", "Uzkopšana", "Dzīvnieki", "Palīdzība senioriem", "Tehnika", "Cits"],
  en: ["Errands", "Delivery", "Transport", "Home help", "Repairs", "Cleaning", "Pets", "Senior help", "Technology", "Other"],
  uk: ["Доручення", "Доставка", "Перевезення", "Допомога вдома", "Ремонт", "Прибирання", "Тварини", "Допомога літнім", "Техніка", "Інше"],
};
const fallback: Order[] = [
  {
    id: "demo1",
    category: "Поручения",
    service: "Забрать посылку и привезти домой",
    description: "Забрать небольшую посылку в центре и привезти в Пурвциемс",
    price: "€15",
    city: "Rīga",
    district: "Purvciems",
    date: "Сегодня",
    lat: 56.957,
    lng: 24.18,
    customerId: "demo",
    customerName: "Anna",
    status: "open",
  },
  {
    id: "demo2",
    category: "Животные",
    service: "Погулять с собакой",
    description: "Нужна прогулка на 45 минут",
    price: "€12",
    city: "Rīga",
    district: "Centrs",
    date: "Завтра",
    lat: 56.952,
    lng: 24.112,
    customerId: "demo",
    customerName: "Jānis",
    status: "open",
  },
  {
    id: "demo3",
    category: "Помощь по дому",
    service: "Помочь поднять мебель",
    description: "Нужно поднять небольшой диван на третий этаж",
    price: "€25",
    city: "Rīga",
    district: "Imanta",
    date: "На неделе",
    lat: 56.956,
    lng: 24.01,
    customerId: "demo",
    customerName: "Maksims",
    status: "open",
  },
];
function compressImage(file: File, max = 900, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let size = max,
          q = quality,
          result = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          const scale = Math.min(1, size / Math.max(img.width, img.height)),
            canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas
            .getContext("2d")!
            .drawImage(img, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL("image/jpeg", q);
          if (result.length < 720_000) break;
          size = Math.round(size * 0.8);
          q = Math.max(0.5, q - 0.08);
        }
        if (result.length >= 900_000) reject(new Error("IMAGE_TOO_LARGE"));
        else resolve(result);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
function coordsNear(center: [number, number]) {
  return {
    lat: center[0] + (Math.random() - 0.5) * 0.018,
    lng: center[1] + (Math.random() - 0.5) * 0.028,
  };
}

export default function App() {
  const [lang, setLang] = useState<Lang>("ru"),
    [role, setRole] = useState<Role>("customer"),
    [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [modal, setModal] = useState<Modal>(null),
    [queryText, setQueryText] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [editing, setEditing] = useState<Order | null>(null),
    [selectedOrder, setSelectedOrder] = useState<Order | null>(null),
    [pendingChatOrderId, setPendingChatOrderId] = useState<string | null>(null),
    [orderPhoto, setOrderPhoto] = useState(""),
    [avatar, setAvatar] = useState(""),
    [center, setCenter] = useState<[number, number]>([56.9496, 24.1052]),
    [geoStatus, setGeoStatus] = useState("Rīga, Centrs"),
    [isModerator, setIsModerator] = useState(false),
    [modEmail, setModEmail] = useState(""),
    [chats, setChats] = useState<Chat[]>([]),
    [activeChat, setActiveChat] = useState<Chat | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [message, setMessage] = useState(""),
    [ssLeads, setSsLeads] = useState<SsLead[]>([]),
    [externalLeads, setExternalLeads] = useState<ExternalLead[]>([]),
    [externalMode, setExternalMode] = useState<"task" | "helper">("task"),
    [externalLimit, setExternalLimit] = useState(60),
    [dismissedLeads, setDismissedLeads] = useState<string[]>([]),
    [adminUsers, setAdminUsers] = useState<AdminUser[]>([]),
    [leadUpdated, setLeadUpdated] = useState<string | null>(null),
    [alertsEnabled, setAlertsEnabled] = useState(
      () => localStorage.getItem("murdilimax-task-alerts") === "on",
    ),
    [linkedTaskId, setLinkedTaskId] = useState<string | null>(null),
    [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
      null,
    );
  const selectedCard = useRef<HTMLDivElement | null>(null),
    knownOrderIds = useRef<Set<string> | null>(null),
    t = ui[lang],
    isOwner = user?.email?.toLowerCase() === OWNER_EMAIL,
    canModerate = isOwner || isModerator;
  const notify = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(""), 2600);
  };
  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        setProfile(null);
        setIsModerator(false);
        if (!u) return;
        const ref = doc(db, "users", u.uid),
          snap = await getDoc(ref);
        if (snap.exists() && snap.data().blocked) {
          await signOut(auth);
          notify("Ваш аккаунт заблокирован");
          return;
        }
        const base: Profile = {
          displayName: u.displayName || "",
          phone: "",
          bio: "",
          services: "",
          city: "Rīga",
          role: "customer",
          avatar: u.photoURL || "",
          email: u.email || "",
        };
        if (snap.exists()) setProfile({ ...base, ...snap.data() } as Profile);
        else {
          const referredBy = new URLSearchParams(location.search).get("ref");
          await setDoc(ref, {
            ...base,
            ...(referredBy && referredBy !== u.uid ? { referredBy } : {}),
            createdAt: serverTimestamp(),
          });
          setProfile(base);
        }
        if (u.email)
          setIsModerator(
            (
              await getDoc(doc(db, "moderators", u.email.toLowerCase()))
            ).exists(),
          );
      }),
    [],
  );
  useEffect(() => {
    fetch(`/external-leads.json?v=${Date.now()}`)
      .then((response) => response.json())
      .then((data) => setExternalLeads(Array.isArray(data.leads) ? data.leads : []))
      .catch(() => setExternalLeads([]));
  }, []);
  useEffect(() => {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (s) => {
        const next = s.docs.map((d) => ({ id: d.id, ...d.data() }) as Order);
        const known = knownOrderIds.current;
        if (
          known &&
          localStorage.getItem("murdilimax-task-alerts") === "on" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          const city=(profile?.alertCity||"").trim().toLowerCase(),words=(profile?.alertKeywords||"").toLowerCase().split(",").map(x=>x.trim()).filter(Boolean);
          const fresh = next.find((order) => {
            const text=`${order.category||""} ${order.service} ${order.description}`.toLowerCase();
            return !known.has(order.id) && order.customerId !== auth.currentUser?.uid && (!city||order.city.toLowerCase().includes(city)) && (!words.length||words.some(word=>text.includes(word)));
          });
          if (fresh)
            new Notification("Новое задание рядом · MURDILIMAX", {
              body: `${fresh.service} · ${fresh.district}, ${fresh.city} · ${fresh.price}`,
              icon: "/icon-192.png",
            });
        }
        knownOrderIds.current = new Set(next.map((order) => order.id));
        setOrders(next);
      },
      (error) => {
        console.error(error);
        setOrders([]);
        notify("Не удалось загрузить заявки. Проверьте интернет и обновите страницу");
      },
    );
  }, [profile?.alertCity, profile?.alertKeywords]);
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      taskId = params.get("task"),
      category = params.get("category");
    if (category) setQueryText(category);
    if (!taskId || !orders.some((order) => order.id === taskId)) return;
    setLinkedTaskId(taskId);
    setRole("master");
    setTimeout(
      () =>
        document
          .getElementById(`order-${taskId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      120,
    );
  }, [orders]);
  useEffect(() => {
    if (!user) {
      setChats([]);
      return;
    }
    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.uid),
    );
    return onSnapshot(
      q,
      (s) => setChats(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Chat)),
      (error) => {
        console.error(error);
        notify("Не удалось загрузить список чатов");
      },
    );
  }, [user]);
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, "chats", activeChat.id, "messages"),
      orderBy("createdAt", "asc"),
    );
    return onSnapshot(
      q,
      (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)),
      (error) => {
        console.error(error);
        notify("Не удалось загрузить сообщения");
      },
    );
  }, [activeChat]);
  useEffect(() => {
    if (!canModerate || modal !== "admin") return;
    fetch(`/ss-leads.json?v=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => {
        setSsLeads(Array.isArray(data.leads) ? data.leads : []);
        setLeadUpdated(data.generatedAt || null);
      })
      .catch(() => notify("Не удалось загрузить монитор SS.com"));
    const stopUsers = onSnapshot(collection(db, "users"), (s) =>
      setAdminUsers(
        s.docs.map((d) => ({ id: d.id, ...d.data() }) as AdminUser),
      ),
    );
    const stopSettings = onSnapshot(doc(db, "moderation", "ssLeads"), (s) =>
      setDismissedLeads((s.data()?.dismissed || []) as string[]),
    );
    return () => {
      stopUsers();
      stopSettings();
    };
  }, [canModerate, modal]);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      notify("Приложение установлено");
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  const visible = useMemo(() => {
    const q = queryText.toLowerCase();
    return (orders.length ? orders : fallback).filter(
      (o) =>
        !q ||
        `${o.category || ""} ${o.service} ${o.description} ${o.district}`.toLowerCase().includes(q),
    );
  }, [orders, queryText]);
  const myOrders = orders.filter((o) => o.customerId === user?.uid);
  const externalResults = useMemo(() => {
    const q = queryText.toLowerCase();
    const filtered = externalLeads
      .filter((lead) => lead.type === externalMode)
      .filter((lead) => !q || `${lead.category} ${lead.title} ${lead.city}`.toLowerCase().includes(q));
    if (externalMode === "helper") return { items: filtered.slice(0, externalLimit), total: filtered.length };
    const ss = filtered.filter((lead) => lead.source === "SS.com");
    const nva = filtered.filter((lead) => lead.source.startsWith("NVA"));
    const other = filtered.filter((lead) => lead.source !== "SS.com" && !lead.source.startsWith("NVA"));
    const mixed: ExternalLead[] = [];
    for (let index = 0; index < Math.max(ss.length, nva.length); index += 1) {
      if (ss[index]) mixed.push(ss[index]);
      if (nva[index]) mixed.push(nva[index]);
    }
    mixed.push(...other);
    return { items: mixed.slice(0, externalLimit), total: filtered.length };
  }, [externalLeads, externalMode, queryText, externalLimit]);
  const externalVisible = externalResults.items;
  useEffect(() => setExternalLimit(60), [externalMode, queryText]);
  const login = async () => {
    try {
      setBusy(true);
      await signInWithPopup(auth, googleProvider);
      setModal(null);
      notify("Вход выполнен");
    } catch (e) {
      console.error(e);
      notify("Не удалось войти");
    } finally {
      setBusy(false);
    }
  };
  const locate = () => {
    if (!navigator.geolocation) return notify("Геолокация недоступна");
    setGeoStatus("Определяем…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCenter([p.coords.latitude, p.coords.longitude]);
        setGeoStatus("Ваше местоположение");
        notify("Карта перемещена к вам");
      },
      () => {
        setGeoStatus("Доступ к геолокации закрыт");
        notify("Разрешите геолокацию в браузере");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const pickImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "order",
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return notify("Выберите изображение");
    if (f.size > 8_000_000) return notify("Фото должно быть меньше 8 МБ");
    try {
      const data = await compressImage(
        f,
        kind === "avatar" ? 420 : 820,
        kind === "avatar" ? 0.76 : 0.68,
      );
      kind === "avatar" ? setAvatar(data) : setOrderPhoto(data);
    } catch {
      notify("Фото слишком большое. Выберите другое изображение");
    }
  };
  const saveProfile = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const f = new FormData(e.currentTarget),
      data: Profile = {
        displayName: String(f.get("displayName") || ""),
        phone: String(f.get("phone") || ""),
        bio: String(f.get("bio") || ""),
        services: String(f.get("services") || ""),
        city: String(f.get("city") || "Rīga"),
        role: String(f.get("role") || "customer") as Role,
        avatar: avatar || profile?.avatar || user.photoURL || "",
        email: user.email || "",
        alertCity: String(f.get("alertCity") || ""),
        alertKeywords: String(f.get("alertKeywords") || ""),
      };
    try {
      setBusy(true);
      await setDoc(
        doc(db, "users", user.uid),
        { ...data, updatedAt: serverTimestamp() },
        { merge: true },
      );
      setProfile(data);
      setRole(data.role);
      setModal(null);
      notify("Профиль сохранён");
    } catch (e) {
      console.error(e);
      notify("Ошибка сохранения профиля");
    } finally {
      setBusy(false);
    }
  };
  const openOrder = (o?: Order) => {
    if (!user) {
      setModal("login");
      return;
    }
    setEditing(o || null);
    setOrderPhoto(o?.photo || "");
    setModal("order");
  };
  const openTask = (id: string) => {
    const order = [...orders, ...fallback].find((item) => item.id === id);
    if (!order) return notify("Задание больше недоступно");
    setSelectedOrder(order);
    setLinkedTaskId(id);
    setModal("task");
  };
  const saveOrder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const f = new FormData(e.currentTarget),
      c = editing ? { lat: editing.lat, lng: editing.lng } : coordsNear(center),
      rawPrice = String(f.get("price") || "").trim(),
      price =
        rawPrice && /^\d+(?:[.,]\d+)?$/.test(rawPrice)
          ? `€${rawPrice}`
          : rawPrice || "Цена договорная",
      data = {
        category: String(f.get("category") || "Другое").trim(),
        service: String(f.get("service")).trim(),
        description: String(f.get("description")).trim(),
        price,
        city: String(f.get("city")).trim(),
        district: String(f.get("district")).trim(),
        date: String(f.get("date")).trim(),
        photo: orderPhoto,
        lat: c.lat,
        lng: c.lng,
        customerId: user.uid,
        customerName: profile?.displayName || user.displayName || "Пользователь",
        status: "open",
        updatedAt: serverTimestamp(),
      };
    try {
      setBusy(true);
      if (editing) await updateDoc(doc(db, "orders", editing.id), data);
      else
        await addDoc(collection(db, "orders"), {
          ...data,
          createdAt: serverTimestamp(),
        });
      setModal(null);
      setEditing(null);
      notify(editing ? "Объявление обновлено" : "Объявление опубликовано");
    } catch (err) {
      console.error(err);
      const code = (err as { code?: string }).code || "";
      notify(
        code.includes("permission-denied")
          ? "Нет доступа. Обновите страницу и войдите снова"
          : code.includes("resource-exhausted")
            ? "Фото слишком большое"
            : "Не удалось сохранить. Проверьте интернет и повторите",
      );
    } finally {
      setBusy(false);
    }
  };
  const removeOrder = async (o: Order) => {
    if (!user || o.customerId !== user.uid) return;
    if (!confirm("Удалить объявление?")) return;
    try {
      await deleteDoc(doc(db, "orders", o.id));
      notify("Объявление удалено");
    } catch (error) {
      console.error(error);
      notify("Не удалось удалить объявление. Проверьте интернет и повторите");
    }
  };
  const startChat = async (o: Order) => {
    if (!user) {
      setSelectedOrder(o);
      setPendingChatOrderId(o.id);
      setModal("login");
      return;
    }
    if (o.customerId === user.uid) return notify("Это ваше объявление");
    try {
      setBusy(true);
      const id = `${o.id}_${o.customerId}_${user.uid}`,
        ref = doc(db, "chats", id);
      await setDoc(ref, {
        orderId: o.id,
        orderTitle: o.service,
        participants: [o.customerId, user.uid],
        customerId: o.customerId,
        masterId: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      const chat = { id, orderId: o.id, orderTitle: o.service, participants: [o.customerId, user.uid], customerId: o.customerId, masterId: user.uid };
      setActiveChat(chat);
      setPendingChatOrderId(null);
      setModal("chats");
    } catch (error) {
      console.error(error);
      notify("Не удалось открыть чат. Обновите страницу и повторите");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!user || !pendingChatOrderId) return;
    const order = [...orders, ...fallback].find((item) => item.id === pendingChatOrderId);
    if (order) {
      setPendingChatOrderId(null);
      void startChat(order);
    }
  }, [user, pendingChatOrderId, orders]);
  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !activeChat || !message.trim()) return;
    const text = message.trim();
    try {
      setMessage("");
      await addDoc(collection(db, "chats", activeChat.id, "messages"), {
        text,
        senderId: user.uid,
        senderName: profile?.displayName || user.displayName || "Пользователь",
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "chats", activeChat.id), { lastMessage: text, updatedAt: serverTimestamp() });
    } catch (error) {
      console.error(error);
      setMessage(text);
      notify("Сообщение не отправлено. Проверьте интернет и повторите");
    }
  };
  const addModerator = async () => {
    const email = modEmail.trim().toLowerCase();
    if (!isOwner || !email.includes("@")) return;
    await setDoc(doc(db, "moderators", email), {
      email,
      addedAt: serverTimestamp(),
      addedBy: user?.email,
    });
    setModEmail("");
    notify("Модератор добавлен");
  };
  const hideLead = async (id: string) => {
    await setDoc(
      doc(db, "moderation", "ssLeads"),
      { dismissed: arrayUnion(id), updatedAt: serverTimestamp() },
      { merge: true },
    );
    notify("Объявление убрано");
  };
  const clearLeads = async () => {
    if (!confirm("Убрать все найденные объявления из списка?")) return;
    await setDoc(
      doc(db, "moderation", "ssLeads"),
      { dismissed: ssLeads.map((x) => x.id), updatedAt: serverTimestamp() },
      { merge: true },
    );
    notify("Список очищен");
  };
  const toggleBlock = async (target: AdminUser) => {
    if (target.email?.toLowerCase() === OWNER_EMAIL)
      return notify("Владельца заблокировать нельзя");
    await updateDoc(doc(db, "users", target.id), {
      blocked: !target.blocked,
      blockedAt: target.blocked ? null : serverTimestamp(),
    });
    notify(
      target.blocked
        ? "Пользователь разблокирован"
        : "Пользователь заблокирован",
    );
  };
  const activeLeads = ssLeads.filter((x) => !dismissedLeads.includes(x.id));
  const buildShareUrl = (taskId?: string) => {
    const url = new URL(taskId ? `/task/${encodeURIComponent(taskId)}/` : "/", location.origin);
    if (user) url.searchParams.set("ref", user.uid);
    return url.toString();
  };
  const shareContent = async (title: string, text: string, url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      notify("Ссылка скопирована");
    } catch {
      notify("Не удалось скопировать ссылку");
    }
  };
  const shareOrder = (order: Order) =>
    shareContent(
      `${order.service} · MURDILIMAX`,
      `${order.service}\n${order.district}, ${order.city} · ${order.date}\nБюджет: ${order.price}`,
      buildShareUrl(order.id),
    );
  const shareOrderOnFacebook = (order: Order) => {
    const shareUrl=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(buildShareUrl(order.id))}`;
    window.open(shareUrl,"_blank","noopener,noreferrer");
  };
  const inviteHelper = () =>
    shareContent(
      "MURDILIMAX — любая помощь рядом",
      "Присоединяйтесь к MURDILIMAX: находите задания рядом или просите о помощи.",
      buildShareUrl(),
    );
  const enableAlerts = async () => {
    if (!("Notification" in window))
      return notify("Уведомления не поддерживаются этим браузером");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return notify("Уведомления не разрешены");
    localStorage.setItem("murdilimax-task-alerts", "on");
    setAlertsEnabled(true);
    notify("Уведомления о новых заданиях включены");
  };
  const installApp = async () => {
    if (!installPrompt)
      return notify(
        "Откройте меню браузера и выберите «Установить приложение»",
      );
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "dismissed") notify("Установка отменена");
    setInstallPrompt(null);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand">
          <span className="brand-mark">
            <Hammer />
          </span>
          <span>
            MURDILI<b>MAX</b>
          </span>
        </button>
        <nav>
          <button className="active">
            <MapPin />
            {t.map}
          </button>
          <button
            onClick={() =>
              selectedCard.current?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <BriefcaseBusiness />
            {t.orders}
          </button>
          <button>
            <Users />
            {t.masters}
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => notify("Звуки включены")}
          >
            <Volume2 />
          </button>
          <div className="language">
            <Languages />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
            >
              {["ru", "lv", "en", "uk"].map((x) => (
                <option key={x} value={x}>
                  {x === "uk" ? "UA" : x.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {user && (
            <button
              className="icon-button"
              title={t.chats}
              onClick={() => setModal("chats")}
            >
              <MessageCircle />
            </button>
          )}
          <button
            className="login-button"
            onClick={() => (user ? setModal("profile") : setModal("login"))}
          >
            <CircleUserRound />
            <span>{user ? profile?.displayName || t.profile : t.login}</span>
          </button>
        </div>
      </header>
      <section className="command-panel">
        <div className="role-switch">
          <button
            className={role === "customer" ? "active" : ""}
            onClick={() => setRole("customer")}
          >
            <UserRound />
            {t.roleC}
          </button>
          <button
            className={role === "master" ? "active" : ""}
            onClick={() => setRole("master")}
          >
            <Wrench />
            {t.roleM}
          </button>
        </div>
        <div className="headline">
          <div>
            <p className="eyebrow">MURDILIMAX · LATVIJA</p>
            <h1>{t.headline}</h1>
            <p>{t.sub}</p>
          </div>
          <button className="primary" onClick={() => openOrder()}>
            <Plus />
            {t.newOrder}
          </button>
        </div>
        <div className="search-row">
          <label className="searchbox">
            <Search />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t.search}
            />
          </label>
          <button className="location">
            <MapPin />
            <span>{geoStatus}</span>
          </button>
          <button className="locate" onClick={locate}>
            <LocateFixed />
          </button>
        </div>
        <div className="service-strip">
          {categories[lang].map((s) => (
            <button key={s} onClick={() => setQueryText(s)}>
              {s}
            </button>
          ))}
        </div>
      </section>
      <section className="workspace">
        <div className="map-card">
          <div className="map-toolbar">
            <div>
              <strong>{t.near}</strong>
              <span>
                {geoStatus} · {visible.length}
              </span>
            </div>
            <button onClick={locate}>
              <LocateFixed />
              Где я
            </button>
          </div>
          <Suspense fallback={<div className="real-map map-loading">Загружаем карту…</div>}><MapPanel
            center={center}
            orders={visible.map(
              (o) =>
                ({
                  id: o.id,
                  service: o.service,
                  price: o.price,
                  district: o.district,
                  lat: o.lat,
                  lng: o.lng,
                }) as MapOrder,
            )}
            onSelect={openTask}
          /></Suspense>
        </div>
        <aside className="feed" ref={selectedCard}>
          <div className="section-title">
            <div>
              <h2>{role === "customer" ? t.myOrders : t.near}</h2>
              <p>
                {user
                  ? "Данные обновляются автоматически"
                  : "Войдите, чтобы публиковать и писать"}
              </p>
            </div>
            <button
              className={alertsEnabled ? "alerts-on" : ""}
              onClick={enableAlerts}
              title={alertsEnabled ? "Уведомления включены" : "Включить уведомления"}
            >
              <Bell />
            </button>
          </div>
          {(role === "customer" && user ? myOrders : visible).map((o) => (
            <article
              id={`order-${o.id}`}
              className={`job-card rich ${linkedTaskId === o.id ? "linked-task" : ""}`}
              key={o.id}
            >
              {o.photo && <img className="order-thumb" src={o.photo} alt="" />}
              <div className="job-top">
                <div>
                  {o.category && <span className="task-category">{o.category}</span>}
                  <h3>{o.service}</h3>
                  <p>
                    <MapPin />
                    {o.district}, {o.city} · {o.date}
                  </p>
                </div>
                <strong>{o.price}</strong>
              </div>
              <p className="order-description">{o.description}</p>
              <div className="share-task-actions">
                <button className="share-task" onClick={() => shareOrder(o)}>
                  <Share2 />
                  {t.share}
                </button>
                <button
                  className="facebook-share"
                  onClick={() => shareOrderOnFacebook(o)}
                >
                  <b>f</b>
                  Facebook
                </button>
              </div>
              {o.customerId === user?.uid ? (
                <div className="card-actions">
                  <button onClick={() => openOrder(o)}>
                    <Pencil />
                    Редактировать
                  </button>
                  <button className="danger" onClick={() => removeOrder(o)}>
                    <Trash2 />
                    Удалить
                  </button>
                </div>
              ) : (
                <button className="chat-cta" onClick={() => startChat(o)}>
                  {t.respond}
                  <MessageCircle />
                </button>
              )}
            </article>
          ))}
          {role === "customer" && user && myOrders.length === 0 && (
            <div className="empty">
              <BriefcaseBusiness />
              <b>Пока нет объявлений</b>
              <button className="primary" onClick={() => openOrder()}>
                Создать первое
              </button>
            </div>
          )}
        </aside>
      </section>
      <section className="opportunity-hub" id="latvia-opportunities">
        <div className="opportunity-head">
          <div>
            <p className="eyebrow">РАДАР MURDILIMAX · LATVIJA</p>
            <h2>Подработка и помощники по всей Латвии</h2>
            <p>
              Публичные объявления собираются автоматически с SS.com и из
              официальных открытых данных NVA. Контакты остаются на источнике.
            </p>
          </div>
          <div className="opportunity-switch">
            <button
              className={externalMode === "task" ? "active" : ""}
              onClick={() => setExternalMode("task")}
            >
              Ищут помощников
            </button>
            <button
              className={externalMode === "helper" ? "active" : ""}
              onClick={() => setExternalMode("helper")}
            >
              Предлагают помощь
            </button>
          </div>
        </div>
        <div className="opportunity-summary">
          <b>{externalVisible.length} из {externalResults.total}</b>
          <span>
            {externalMode === "task" ? "актуальных предложений" : "публичных анкет"}
            {queryText ? ` по запросу «${queryText}»` : ""}
          </span>
          <a href={externalMode === "task" ? "/podrabotka/" : "/pomoshchniki/"}>
            Открыть каталог для Google
          </a>
        </div>
        <div className="opportunity-grid">
          {externalVisible.map((lead) => (
            <article key={`${lead.type}-${lead.id}`}>
              <div className="opportunity-meta">
                <span>{lead.category}</span>
                <small><MapPin />{lead.city}</small>
              </div>
              <h3>{lead.title}</h3>
              <div className="opportunity-card-foot">
                <small>Внешний источник: {lead.source}</small>
                <a href={lead.url} target="_blank" rel="nofollow noreferrer">
                  Открыть оригинал <ExternalLink />
                </a>
              </div>
            </article>
          ))}
          {!externalVisible.length && (
            <div className="admin-empty">
              <Search /> Подходящих объявлений пока не найдено
            </div>
          )}
        </div>
        {externalVisible.length < externalResults.total && (
          <button className="primary opportunity-more" onClick={() => setExternalLimit((value) => value + 60)}>
            Показать ещё 60
          </button>
        )}
      </section>
      <footer>
        <span>© 2026 MURDILIMAX</span>
        <a href={lang === "lv" ? "/lv/buvdarbu-cenas/" : "/stroitelnye-rascenki/"}>
          {lang === "lv" ? "Būvdarbu cenas" : "Строительные расценки"}
        </a>
        <button onClick={installApp}>
          <Download />
          Установить приложение
        </button>
        {user && (
          <button onClick={() => setModal("profile")}>
            <UserRound />
            {t.profile}
          </button>
        )}
        {canModerate && (
          <button onClick={() => setModal("admin")}>
            <ShieldCheck />
            Админ-панель
          </button>
        )}
      </footer>
      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)}>
          <section
            className={`modal ${modal === "chats" ? "chat-modal" : ""} ${modal === "admin" ? "admin-modal" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className="close" onClick={() => setModal(null)}>
              <X />
            </button>
            {modal === "login" && (
              <>
                <div className="modal-icon">
                  <CircleUserRound />
                </div>
                <h2>{t.login}</h2>
                <p>Один аккаунт: просите о помощи или помогайте другим.</p>
                <button className="google" disabled={busy} onClick={login}>
                  <b>G</b>
                  {busy ? "Подключение…" : t.login}
                </button>
              </>
            )}
            {modal === "task" && selectedOrder && (
              <div className="task-details">
                {selectedOrder.photo && <img className="task-details-photo" src={selectedOrder.photo} alt="" />}
                <div className="task-details-head">
                  <div>
                    {selectedOrder.category && <span>{selectedOrder.category}</span>}
                    <h2>{selectedOrder.service}</h2>
                    <p><MapPin /> {selectedOrder.district}, {selectedOrder.city}</p>
                  </div>
                  <strong>{selectedOrder.price}</strong>
                </div>
                <div className="task-details-meta">
                  <span>Когда: {selectedOrder.date}</span>
                  <span>Заказчик: {selectedOrder.customerName}</span>
                </div>
                <p className="task-details-description">{selectedOrder.description}</p>
                {selectedOrder.customerId === user?.uid ? (
                  <button className="primary wide-button" onClick={() => openOrder(selectedOrder)}><Pencil /> Редактировать объявление</button>
                ) : (
                  <button className="primary wide-button" disabled={busy} onClick={() => startChat(selectedOrder)}><MessageCircle /> {busy ? "Открываем чат…" : "Написать заказчику"}</button>
                )}
              </div>
            )}
            {modal === "profile" && user && (
              <form onSubmit={saveProfile}>
                <div className="profile-head">
                  <label className="avatar-editor">
                    {avatar || profile?.avatar ? (
                      <img src={avatar || profile?.avatar} />
                    ) : (
                      <UserRound />
                    )}
                    <span>
                      <Camera />
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => pickImage(e, "avatar")}
                    />
                  </label>
                  <div>
                    <h2>{t.profile}</h2>
                    <p>{user.email}</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>
                    Имя
                    <input
                      name="displayName"
                      required
                      defaultValue={profile?.displayName}
                    />
                  </label>
                  <label>
                    Телефон
                    <input name="phone" defaultValue={profile?.phone} />
                  </label>
                  <label>
                    Город
                    <input name="city" defaultValue={profile?.city || "Rīga"} />
                  </label>
                  <label>
                    Роль
                    <select name="role" defaultValue={profile?.role || role}>
                      <option value="customer">Нужна помощь</option>
                      <option value="master">Помощник</option>
                    </select>
                  </label>
                  <label className="wide">
                    О себе
                    <textarea
                      name="bio"
                      defaultValue={profile?.bio}
                      placeholder="Опыт, языки, график работы"
                    />
                  </label>
                  <label className="wide">
                    Чем можете помогать
                    <textarea
                      name="services"
                      defaultValue={profile?.services}
                      placeholder="Доставка, уборка, ремонт, животные, поручения…"
                    />
                  </label>
                  <label>
                    Город для уведомлений
                    <input name="alertCity" defaultValue={profile?.alertCity || profile?.city || "Rīga"} placeholder="Например, Rīga" />
                  </label>
                  <label>
                    Нужные задания
                    <input name="alertKeywords" defaultValue={profile?.alertKeywords} placeholder="уборка, доставка, ремонт" />
                  </label>
                </div>
                <button className="primary wide-button" disabled={busy}>
                  <Check />
                  Сохранить профиль
                </button>
                <button
                  type="button"
                  className="invite-helper"
                  onClick={inviteHelper}
                >
                  <Share2 />
                  {t.invite}
                </button>
                <button
                  type="button"
                  className="logout"
                  onClick={() => {
                    signOut(auth);
                    setModal(null);
                  }}
                >
                  Выйти из аккаунта
                </button>
              </form>
            )}
            {modal === "order" && user && (
              <form onSubmit={saveOrder}>
                <div className="modal-icon">
                  <Plus />
                </div>
                <h2>{editing ? "Редактировать объявление" : t.newOrder}</h2>
                <label className="photo-picker">
                  {orderPhoto ? (
                    <img src={orderPhoto} />
                  ) : (
                    <>
                      <Camera />
                      <span>Добавить фото к заданию</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => pickImage(e, "order")}
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Категория
                    <select
                      name="category"
                      required
                      defaultValue={editing?.category || categories[lang][0]}
                    >
                      {categories[lang].map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Что нужно сделать
                    <input
                      name="service"
                      required
                      placeholder="Например, забрать посылку"
                      defaultValue={editing?.service}
                    />
                  </label>
                  <label>
                    Бюджет
                    <input
                      name="price"
                      placeholder="Например, €40–60"
                      defaultValue={editing?.price}
                    />
                  </label>
                  <label>
                    Город
                    <input
                      name="city"
                      required
                      defaultValue={editing?.city || profile?.city || "Rīga"}
                    />
                  </label>
                  <label>
                    Район
                    <input
                      name="district"
                      required
                      defaultValue={editing?.district || "Centrs"}
                    />
                  </label>
                  <label>
                    Когда
                    <input
                      name="date"
                      required
                      defaultValue={editing?.date || "В ближайшее время"}
                    />
                  </label>
                  <label className="wide">
                    Описание
                    <textarea
                      name="description"
                      required
                      defaultValue={editing?.description}
                    />
                  </label>
                </div>
                <button className="primary wide-button" disabled={busy}>
                  <Check />
                  {busy ? "Сохраняем…" : "Сохранить объявление"}
                </button>
              </form>
            )}
            {modal === "chats" && user && (
              <div className="chat-layout">
                <aside>
                  <h2>{t.chats}</h2>
                  {chats.map((c) => (
                    <button
                      className={activeChat?.id === c.id ? "active" : ""}
                      onClick={() => setActiveChat(c)}
                      key={c.id}
                    >
                      <MessageCircle />
                      <span>
                        <b>{c.orderTitle}</b>
                        <small>
                          {c.id === activeChat?.id ? "Открыт" : "Переписка"}
                        </small>
                      </span>
                    </button>
                  ))}
                  {!chats.length && (
                    <p>
                      Пока нет чатов. Помощник может написать по опубликованному
                      заданию.
                    </p>
                  )}
                </aside>
                <section>
                  {activeChat ? (
                    <>
                      <header>
                        <b>{activeChat.orderTitle}</b>
                        <span>Защищённый чат</span>
                      </header>
                      <div className="messages">
                        {messages.map((m) => (
                          <div
                            className={m.senderId === user.uid ? "mine" : ""}
                            key={m.id}
                          >
                            <b>{m.senderName}</b>
                            <p>{m.text}</p>
                          </div>
                        ))}
                      </div>
                      <form className="message-form" onSubmit={sendMessage}>
                        <input
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Напишите сообщение…"
                        />
                        <button disabled={!message.trim()}>
                          <Send />
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="empty-chat">
                      <MessageCircle />
                      <p>Выберите чат слева</p>
                    </div>
                  )}
                </section>
              </div>
            )}
            {modal === "admin" && canModerate && (
              <div className="admin-dashboard">
                <div className="admin-title">
                  <div className="modal-icon">
                    <ShieldCheck />
                  </div>
                  <div>
                    <h2>Админ-панель</h2>
                    <p>
                      {user?.email} · {isOwner ? "владелец" : "модератор"}
                    </p>
                  </div>
                </div>
                <div className="admin-stats">
                  <div>
                    <strong>{adminUsers.length}</strong>
                    <span>пользователей</span>
                  </div>
                  <div>
                    <strong>{orders.length}</strong>
                    <span>объявлений</span>
                  </div>
                  <div>
                    <strong>{activeLeads.length}</strong>
                    <span>новых с SS.com</span>
                  </div>
                </div>
                <section className="admin-section">
                  <div className="admin-section-head">
                    <div>
                      <h3>Новые исполнители с SS.com</h3>
                      <small>
                        Стройка и ремонт · проверка каждые 15 минут
                        {leadUpdated
                          ? ` · ${new Date(leadUpdated).toLocaleString("ru-RU")}`
                          : ""}
                      </small>
                    </div>
                    {activeLeads.length > 0 && (
                      <button className="danger-button" onClick={clearLeads}>
                        <Trash2 />
                        Очистить всё
                      </button>
                    )}
                  </div>
                  {activeLeads.length ? (
                    <div className="lead-list">
                      {activeLeads.map((lead) => (
                        <article key={lead.id}>
                          <div>
                            <span>{lead.category}</span>
                            <p>{lead.title}</p>
                            <small>
                              {new Date(lead.foundAt).toLocaleString("ru-RU")}
                            </small>
                          </div>
                          <div className="lead-actions">
                            <a href={lead.url} target="_blank" rel="noreferrer">
                              <ExternalLink />
                              Открыть
                            </a>
                            <button
                              className="danger"
                              onClick={() => hideLead(lead.id)}
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="admin-empty">
                      <Check />
                      Новых объявлений пока нет
                    </div>
                  )}
                </section>
                <section className="admin-section">
                  <h3>Пользователи MURDILIMAX</h3>
                  <div className="user-table">
                    {adminUsers.map((person) => (
                      <div key={person.id}>
                        <span className="mini-avatar">
                          {(person.displayName || person.email || "?")
                            .slice(0, 1)
                            .toUpperCase()}
                        </span>
                        <span>
                          <b>{person.displayName || "Без имени"}</b>
                          <small>
                            {person.email || "Email не указан"} ·{" "}
                            {person.role === "master"
                              ? "помощник"
                              : "ищет помощь"}
                          </small>
                        </span>
                        <button
                          className={person.blocked ? "unblock" : "block"}
                          onClick={() => toggleBlock(person)}
                        >
                          <Ban />
                          {person.blocked ? "Разблокировать" : "Блокировать"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                {isOwner && (
                  <section className="admin-section">
                    <h3>Добавить модератора</h3>
                    <div className="add-mod">
                      <input
                        value={modEmail}
                        onChange={(e) => setModEmail(e.target.value)}
                        placeholder="moderator@gmail.com"
                      />
                      <button onClick={addModerator}>
                        <Plus />
                      </button>
                    </div>
                  </section>
                )}
                <p className="security-note">
                  <ShieldCheck />
                  Доступ владельца: {OWNER_EMAIL}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </main>
  );
}
