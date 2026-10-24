import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { io } from "socket.io-client";
import { api, getToken, mergeById, setToken } from "./api.js";
import Auth from "./components/Auth.jsx";
import ChatList from "./components/ChatList.jsx";
import Conversation from "./components/Conversation.jsx";

const INVITE_KEY = "gilded-invite";

function initialInvite() {
  const fromUrl = new URLSearchParams(location.search).get("invite");
  if (fromUrl) sessionStorage.setItem(INVITE_KEY, fromUrl);
  return fromUrl || sessionStorage.getItem(INVITE_KEY);
}

export default function App() {
  const reduce = useReducedMotion();
  const [me, setMe] = useState(null); // null = checking, false = logged out
  const [notice, setNotice] = useState("");
  const [conversations, setConversations] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingFor, setTypingFor] = useState({});
  const [invite, setInvite] = useState(initialInvite);
  const socketRef = useRef(null);
  const openRef = useRef(null);
  const messagesRef = useRef([]);
  const typingTimers = useRef(new Map());
  openRef.current = openId;
  messagesRef.current = messages;

  const signOut = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setToken(null);
    setMe(false);
    setOpenId(null);
    setConversations([]);
    setMessages([]);
    setTypingFor({});
  }, []);

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) signOut();
      else setNotice(err.message);
    },
    [signOut],
  );

  const refreshList = useCallback(async () => {
    try {
      const { conversations: list } = await api("/api/conversations");
      setConversations(list);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const markRead = useCallback((convId, lastId) => {
    api(`/api/conversations/${convId}/read`, { method: "POST", body: { lastId } }).catch(() => {});
  }, []);

  const loadMessages = useCallback(
    async (convId, afterId = 0) => {
      try {
        const { messages: rows } = await api(
          `/api/conversations/${convId}/messages${afterId ? `?after=${afterId}` : ""}`,
        );
        if (openRef.current !== convId) return;
        if (afterId) {
          if (rows.length) setMessages((prev) => mergeById(prev, rows));
        } else {
          setMessages(rows);
        }
        const last = rows[rows.length - 1];
        if (last) {
          markRead(convId, last.id);
          refreshList();
        }
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, markRead, refreshList],
  );

  // Session check on load.
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (!getToken()) return setMe(false);
      api("/api/me")
        .then(({ user }) => !cancelled && setMe(user))
        .catch((err) => {
          if (cancelled) return;
          if (err.status === 401) return signOut();
          setNotice(err.message);
          setTimeout(check, 3000);
        });
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  // Live connection, once per signed-in user.
  const myId = me ? me.id : null;
  useEffect(() => {
    if (!myId) return;
    const s = io({ auth: { token: getToken() }, transports: ["websocket", "polling"] });
    socketRef.current = s;
    refreshList();

    s.on("connect", () => {
      setNotice("");
      refreshList();
      const id = openRef.current;
      if (id) {
        const last = messagesRef.current[messagesRef.current.length - 1];
        loadMessages(id, last ? last.id : 0);
      }
    });
    s.on("disconnect", () => setNotice("Reconnecting…"));
    s.on("connect_error", (err) => {
      if (err.message === "unauthorized") signOut();
      else setNotice("Reconnecting…");
    });
    s.on("conversations", refreshList);
    s.on("message", ({ conversation_id, message }) => {
      if (openRef.current === conversation_id) {
        setMessages((prev) => mergeById(prev, [message]));
        if (message.sender_id !== myId) markRead(conversation_id, message.id);
      }
      if (message.sender_id !== myId) {
        setTypingFor((p) => ({ ...p, [conversation_id]: false }));
      }
      refreshList();
    });
    s.on("typing", ({ conversation_id }) => {
      setTypingFor((p) => ({ ...p, [conversation_id]: true }));
      clearTimeout(typingTimers.current.get(conversation_id));
      typingTimers.current.set(
        conversation_id,
        setTimeout(() => setTypingFor((p) => ({ ...p, [conversation_id]: false })), 4000),
      );
    });

    const timers = typingTimers.current;
    return () => {
      s.disconnect();
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [myId, loadMessages, markRead, refreshList, signOut]);

  function open(id) {
    setOpenId(id);
    setMessages([]);
    loadMessages(id);
  }

  async function startChat(username) {
    const { conversation_id } = await api("/api/conversations", {
      method: "POST",
      body: { username },
    });
    await refreshList();
    open(conversation_id);
  }

  // Handle an invite link once the user is signed in.
  useEffect(() => {
    if (!me || !invite) return;
    setInvite(null);
    sessionStorage.removeItem(INVITE_KEY);
    history.replaceState(null, "", "/");
    startChat(invite).catch((err) => setNotice(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, invite]);

  async function send(convId, body) {
    const { message } = await api(`/api/conversations/${convId}/messages`, {
      method: "POST",
      body: { body },
    });
    setMessages((prev) => mergeById(prev, [message]));
    refreshList();
  }

  function sendTyping(convId) {
    socketRef.current?.emit("typing", { conversationId: convId });
  }

  async function logout() {
    api("/api/logout", { method: "POST" }).catch(() => {});
    signOut();
  }

  function onAuthed({ token, user }) {
    setToken(token);
    setMe(user);
  }

  const active = conversations.find((c) => c.id === openId);
  const forward = !reduce;

  if (me === null) {
    return (
      <Shell>
        <div className="grid h-[100dvh] place-items-center text-sm text-muted">Loading…</div>
      </Shell>
    );
  }

  if (me === false) {
    return (
      <Shell>
        <Auth onAuthed={onAuthed} inviteFrom={invite} notice={notice} />
      </Shell>
    );
  }

  return (
    <Shell>
      {notice && (
        <div role="status" className="absolute inset-x-0 top-0 z-30 bg-raised py-1.5 text-center text-xs text-gold-soft">
          {notice}
        </div>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {!active ? (
          <motion.div
            key="list"
            initial={forward ? { x: -40, opacity: 0 } : false}
            animate={{ x: 0, opacity: 1 }}
            exit={forward ? { x: -40, opacity: 0 } : { opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="absolute inset-0 overflow-y-auto"
          >
            <ChatList
              me={me}
              conversations={conversations}
              onOpen={open}
              onStartChat={startChat}
              onLogout={logout}
              reduce={reduce}
            />
          </motion.div>
        ) : (
          <motion.div
            key={`chat-${active.id}`}
            initial={forward ? { x: 60, opacity: 0 } : { opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={forward ? { x: 60, opacity: 0 } : { opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="absolute inset-0 bg-ink"
          >
            <Conversation
              me={me}
              conv={active}
              messages={messages}
              typing={!!typingFor[active.id]}
              onBack={() => {
                setOpenId(null);
                setMessages([]);
                refreshList();
              }}
              onSend={(text) => send(active.id, text)}
              onTyping={() => sendTyping(active.id)}
              reduce={reduce}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] overflow-hidden bg-ink sm:my-6 sm:min-h-0 sm:rounded-[32px] sm:border sm:border-line sm:shadow-2xl">
      <div className="relative h-[100dvh] overflow-hidden sm:h-[calc(100dvh-3rem)] sm:max-h-[860px]">{children}</div>
    </div>
  );
}
