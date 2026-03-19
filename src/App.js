import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCSrQFDKxpW0_az4LNXg2gKHNwE77LrMME",
  authDomain: "test-1-78076.firebaseapp.com",
  projectId: "test-1-78076",
  storageBucket: "test-1-78076.firebasestorage.app",
  messagingSenderId: "228487926970",
  appId: "1:228487926970:web:085537fe47de92b1edde83",
  measurementId: "G-SG71LBM0MK",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MONTHLY_MIN_HOURS = 40;
const MONTHLY_MAX_HOURS = 57;
const SLOT_CAPACITY = 7;

const TIME_OPTIONS = [
  { label: "오전 9시~10시", value: "09:00-10:00" },
  { label: "오전 10시~11시", value: "10:00-11:00" },
  { label: "오전 11시~12시", value: "11:00-12:00" },
  { label: "오후 1시~2시", value: "13:00-14:00" },
  { label: "오후 2시~3시", value: "14:00-15:00" },
  { label: "오후 3시~4시", value: "15:00-16:00" },
  { label: "오후 4시~5시", value: "16:00-17:00" },
  { label: "오후 5시~6시", value: "17:00-18:00" },
  { label: "전체 시간(오전 9시~오후 6시)", value: "ALL_DAY" },
];

const ALL_DAY_SLOTS = [
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["11:00", "12:00"],
  ["13:00", "14:00"],
  ["14:00", "15:00"],
  ["15:00", "16:00"],
  ["16:00", "17:00"],
  ["17:00", "18:00"],
];

const DEFAULT_SLOTS = [
  { id: "2026-03-18-09:00", date: "2026-03-18", start: "09:00", end: "10:00" },
  { id: "2026-03-18-10:00", date: "2026-03-18", start: "10:00", end: "11:00" },
  { id: "2026-03-18-11:00", date: "2026-03-18", start: "11:00", end: "12:00" },
  { id: "2026-03-18-13:00", date: "2026-03-18", start: "13:00", end: "14:00" },
  { id: "2026-03-18-14:00", date: "2026-03-18", start: "14:00", end: "15:00" },
  { id: "2026-03-18-15:00", date: "2026-03-18", start: "15:00", end: "16:00" },
  { id: "2026-03-18-16:00", date: "2026-03-18", start: "16:00", end: "17:00" },
  { id: "2026-03-18-17:00", date: "2026-03-18", start: "17:00", end: "18:00" },
];

const DEFAULT_SETTINGS = {
  title: "동행상담사 일정",
  description:
    "로그인 없이 신청할 수 있습니다. 실시간 현황을 보고 직접 시간을 조정해 주세요.",
  adminContact: "담당자 02-6353-0346",
  hashtags: "월 최소 40시간  일일 최대 정원 7명",
  adminNoticeTemplate:
    "변경 또는 취소를 원할 경우, 담당자에게 우선 연락해 주세요.",
  ownerPassword: "",
  lastNoticeText: "",
};

function buildSlotsFromAdminSelection(date, timeKey) {
  if (!date || !timeKey) return [];

  if (timeKey === "ALL_DAY") {
    return ALL_DAY_SLOTS.map(([start, end]) => ({
      id: `${date}-${start}`,
      date,
      start,
      end,
    }));
  }

  const [start, end] = timeKey.split("-");
  return [{ id: `${date}-${start}`, date, start, end }];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function slotText(slot) {
  return `${formatDate(slot.date)} ${slot.start}~${slot.end}`;
}

function nowStamp() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

function cardStyle(extra = {}) {
  return {
    background: "#ffffff",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
    ...extra,
  };
}

function buttonStyle(primary = false) {
  return {
    border: primary ? "none" : "1px solid #cbd5e1",
    background: primary ? "#0f172a" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    borderRadius: 16,
    padding: "14px 18px",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
  };
}

async function seedInitialData() {
  await setDoc(doc(db, "settings", "app"), DEFAULT_SETTINGS, { merge: true });
  for (const slot of DEFAULT_SLOTS) {
    await setDoc(
      doc(db, "slots", slot.id),
      { ...slot, reservedCount: 0 },
      { merge: true }
    );
  }
}

function CalendarGrid({ slots }) {
  const grouped = slots.reduce((acc, slot) => {
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  const orderedDates = Object.keys(grouped).sort();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {orderedDates.map((date) => {
        const daySlots = [...grouped[date]].sort((a, b) =>
          a.start.localeCompare(b.start)
        );
        return (
          <div
            key={date}
            style={{
              ...cardStyle({
                padding: 20,
                boxShadow: "none",
                border: "1px solid #e2e8f0",
              }),
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 14 }}>
              {formatDate(date)}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {daySlots.map((slot) => {
                const isFull = slot.bookedCount >= SLOT_CAPACITY;
                const ratio = slot.bookedCount / SLOT_CAPACITY;
                const bg = isFull
                  ? "#fee2e2"
                  : ratio >= 0.7
                  ? "#dbeafe"
                  : ratio > 0
                  ? "#f8fafc"
                  : "#ffffff";
                const border = isFull
                  ? "#fca5a5"
                  : ratio >= 0.7
                  ? "#93c5fd"
                  : "#cbd5e1";
                return (
                  <div
                    key={slot.id}
                    style={{
                      border: `2px solid ${border}`,
                      background: bg,
                      borderRadius: 20,
                      padding: 16,
                      minHeight: 150,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 21, fontWeight: 800 }}>
                        {slot.start}~{slot.end}
                      </div>
                      <div
                        style={{ fontSize: 17, color: "#475569", marginTop: 6 }}
                      >
                        {isFull ? "마감" : "신청 가능"}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 30, fontWeight: 800 }}>
                        {slot.bookedCount}
                        <span style={{ fontSize: 18, fontWeight: 700 }}>
                          {" "}
                          / {SLOT_CAPACITY}명
                        </span>
                      </div>
                      <div
                        style={{
                          height: 10,
                          background: "#e2e8f0",
                          borderRadius: 999,
                          overflow: "hidden",
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(
                              ratio * 100,
                              slot.bookedCount > 0 ? 8 : 0
                            )}%`,
                            height: "100%",
                            background: isFull ? "#ef4444" : "#0f172a",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      {slot.memberNames.length > 0 ? (
                        <>
                          {slot.memberNames.slice(0, 4).map((name) => (
                            <span
                              key={name}
                              style={{
                                fontSize: 14,
                                padding: "5px 10px",
                                borderRadius: 999,
                                background: "#ffffff",
                                border: "1px solid #cbd5e1",
                              }}
                            >
                              {name}
                            </span>
                          ))}
                          {slot.memberNames.length > 4 && (
                            <span
                              style={{
                                fontSize: 14,
                                padding: "5px 10px",
                                borderRadius: 999,
                                background: "#ffffff",
                                border: "1px solid #cbd5e1",
                              }}
                            >
                              +{slot.memberNames.length - 4}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 15, color: "#64748b" }}>
                          신청자 없음
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function mergeContinuousTimeRanges(daySlots) {
  if (!Array.isArray(daySlots) || daySlots.length === 0) return [];

  const sorted = [...daySlots].sort((a, b) => a.start.localeCompare(b.start));
  const merged = [];

  for (const slot of sorted) {
    if (merged.length === 0) {
      merged.push({ start: slot.start, end: slot.end });
      continue;
    }

    const last = merged[merged.length - 1];

    if (last.end === slot.start) {
      last.end = slot.end;
    } else {
      merged.push({ start: slot.start, end: slot.end });
    }
  }

  return merged;
}

function buildBookingDateCards(slotIds, slots) {
  const slotList = (slotIds || [])
    .map((id) => slots.find((item) => item.id === id))
    .filter(Boolean)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
    );

  const grouped = {};

  slotList.forEach((slot) => {
    if (!grouped[slot.date]) grouped[slot.date] = [];
    grouped[slot.date].push(slot);
  });

  return Object.keys(grouped)
    .sort()
    .map((date) => ({
      date,
      ranges: mergeContinuousTimeRanges(grouped[date]),
    }));
}

export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [slots, setSlots] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [tab, setTab] = useState("live");
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [noticeText, setNoticeText] = useState("");
  const [formError, setFormError] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTimeKey, setNewTimeKey] = useState("09:00-10:00");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [adminInputPassword, setAdminInputPassword] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const manageTopRef = useRef(null);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "app"), (snapshot) => {
      if (snapshot.exists()) {
        setSettings({ ...DEFAULT_SETTINGS, ...snapshot.data() });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    });

    const unsubSlots = onSnapshot(
      query(collection(db, "slots"), orderBy("date"), orderBy("start")),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setSlots(next);
        setLoading(false);
      }
    );

    const unsubBookings = onSnapshot(
      query(collection(db, "bookings"), orderBy("name")),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setBookings(next);
      }
    );

    return () => {
      unsubSettings();
      unsubSlots();
      unsubBookings();
    };
  }, []);

  function normalizeSlotIds(slotIds) {
    if (!Array.isArray(slotIds)) return [];
    return [...new Set(slotIds.filter((id) => typeof id === "string" && id.trim()))];
  }

  function getSafeReservedCount(slotData, fallback = 0) {
    const count = slotData?.reservedCount;
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      return count;
    }
    return fallback;
  }

  const slotStats = useMemo(() => {
    return [...slots]
      .map((slot) => {
        const members = bookings.filter((booking) =>
          booking.slotIds?.includes(slot.id)
        );

        const reservedCount =
          typeof slot.reservedCount === "number" && slot.reservedCount >= 0
            ? slot.reservedCount
            : members.length;

        return {
          ...slot,
          bookedCount: reservedCount,
          remaining: Math.max(0, SLOT_CAPACITY - reservedCount),
          memberNames: members.map((member) => member.name),
        };
      })
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
      );
  }, [slots, bookings]);

  const bookingSummaries = useMemo(() => {
    return bookings
      .map((booking) => {
        const totalHours = booking.slotIds?.length || 0;
        let status = "적정";
        if (totalHours < MONTHLY_MIN_HOURS) status = "부족";
        if (totalHours > MONTHLY_MAX_HOURS) status = "초과";
        return { ...booking, totalHours, status };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
  }, [bookings]);

  const groupedByDate = useMemo(() => {
    const map = {};
    slotStats.forEach((slot) => {
      if (!map[slot.date]) map[slot.date] = [];
      map[slot.date].push(slot);
    });
    return Object.entries(map);
  }, [slotStats]);

  const hashtagItems = useMemo(() => {
    return (settings.hashtags || "")
      .split(/\s{2,}|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [settings.hashtags]);

  function resetForm() {
    setUserName("");
    setUserPhone("");
    setSelectedSlotIds([]);
    setEditingId(null);
    setFormError("");
  }

  function toggleSlot(slotId) {
    setFormError("");
    const slot = slotStats.find((item) => item.id === slotId);
    const isSelected = selectedSlotIds.includes(slotId);
    if (!isSelected && slot && slot.bookedCount >= SLOT_CAPACITY) return;
    setSelectedSlotIds((prev) =>
      prev.includes(slotId)
        ? prev.filter((id) => id !== slotId)
        : [...prev, slotId]
    );
  }

  function buildNotice(prefix, personName, personPhone, slotIds) {
    const slotInfo = slotIds
      .map((id) => slots.find((slot) => slot.id === id))
      .filter(Boolean)
      .map((slot) => slotText(slot))
      .join(", ");
    return `${prefix} ${personName}님(${personPhone}) 일정 처리 완료. 선택 시간: ${
      slotInfo || "없음"
    }. ${settings.adminNoticeTemplate} 연락처: ${settings.adminContact}`;
  }

  async function saveBooking() {
    const trimmedName = userName.trim();
    const trimmedPhone = userPhone.trim();
    const nextSelectedSlotIds = normalizeSlotIds(selectedSlotIds);

    setFormError("");

    if (!trimmedName) return setFormError("이름을 입력해 주세요.");
    if (!trimmedPhone) return setFormError("연락처를 입력해 주세요.");
    if (nextSelectedSlotIds.length === 0)
      return setFormError("시간을 1개 이상 선택해 주세요.");
    if (
      nextSelectedSlotIds.length < MONTHLY_MIN_HOURS ||
      nextSelectedSlotIds.length > MONTHLY_MAX_HOURS
    ) {
      return setFormError(
        `한 달 ${MONTHLY_MIN_HOURS}시간 이상 ${MONTHLY_MAX_HOURS}시간 이하로 신청해 주세요.`
      );
    }

    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = editingId
          ? doc(db, "bookings", editingId)
          : doc(collection(db, "bookings"));

        let prevSlotIds = [];

        if (editingId) {
          const bookingSnap = await transaction.get(bookingRef);
          if (!bookingSnap.exists()) {
            throw new Error("BOOKING_NOT_FOUND");
          }
          const bookingData = bookingSnap.data() || {};
          prevSlotIds = normalizeSlotIds(bookingData.slotIds);
        }

        const prevSet = new Set(prevSlotIds);
        const nextSet = new Set(nextSelectedSlotIds);

        const addedSlotIds = nextSelectedSlotIds.filter((id) => !prevSet.has(id));
        const removedSlotIds = prevSlotIds.filter((id) => !nextSet.has(id));
        const touchedSlotIds = [...new Set([...addedSlotIds, ...removedSlotIds])];

        const slotRefs = touchedSlotIds.map((slotId) => doc(db, "slots", slotId));
        const slotSnaps = await Promise.all(
          slotRefs.map((slotRef) => transaction.get(slotRef))
        );

        const slotMap = new Map();
        touchedSlotIds.forEach((slotId, index) => {
          slotMap.set(slotId, slotSnaps[index]);
        });

        for (const slotId of addedSlotIds) {
          const slotSnap = slotMap.get(slotId);
          if (!slotSnap || !slotSnap.exists()) {
            throw new Error("SLOT_NOT_FOUND");
          }

          const slotData = slotSnap.data() || {};
          const currentReserved = getSafeReservedCount(slotData, 0);

          if (currentReserved >= SLOT_CAPACITY) {
            throw new Error("SLOT_FULL");
          }
        }

        for (const slotId of addedSlotIds) {
          const slotRef = doc(db, "slots", slotId);
          const slotSnap = slotMap.get(slotId);
          const slotData = slotSnap?.data() || {};
          const currentReserved = getSafeReservedCount(slotData, 0);

          transaction.set(
            slotRef,
            { reservedCount: currentReserved + 1 },
            { merge: true }
          );
        }

        for (const slotId of removedSlotIds) {
          const slotRef = doc(db, "slots", slotId);
          const slotSnap = slotMap.get(slotId);

          if (!slotSnap || !slotSnap.exists()) {
            continue;
          }

          const slotData = slotSnap.data() || {};
          const currentReserved = getSafeReservedCount(slotData, 0);
          const nextReserved = Math.max(0, currentReserved - 1);

          transaction.set(
            slotRef,
            { reservedCount: nextReserved },
            { merge: true }
          );
        }

        const payload = {
          name: trimmedName,
          phone: trimmedPhone,
          slotIds: nextSelectedSlotIds,
          updatedAt: nowStamp(),
        };

        transaction.set(bookingRef, payload, { merge: true });
      });

      const nextNotice = buildNotice(
        editingId ? "[변경 공지]" : "[등록 공지]",
        trimmedName,
        trimmedPhone,
        nextSelectedSlotIds
      );

      setNoticeText(nextNotice);
      await saveSettings({ lastNoticeText: nextNotice });

      resetForm();
      setTab("notice");
    } catch (error) {
      if (error?.message === "SLOT_FULL") {
        setFormError("정원이 찬 시간이 포함되어 있어 저장할 수 없습니다.");
        return;
      }
      if (error?.message === "SLOT_NOT_FOUND") {
        setFormError("선택한 시간 중 사용할 수 없는 시간이 있습니다. 다시 선택해 주세요.");
        return;
      }
      if (error?.message === "BOOKING_NOT_FOUND") {
        setFormError("수정할 신청 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.");
        return;
      }
      setFormError("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  function startEdit(bookingId) {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    setEditingId(booking.id);
    setUserName(booking.name || "");
    setUserPhone(booking.phone || "");
    setSelectedSlotIds(normalizeSlotIds(booking.slotIds));
    setFormError("");
    setTab("manage");
    setTimeout(() => {
      manageTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  async function cancelBooking(bookingId) {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;

    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, "bookings", bookingId);
        const bookingSnap = await transaction.get(bookingRef);

        if (!bookingSnap.exists()) {
          throw new Error("BOOKING_NOT_FOUND");
        }

        const bookingData = bookingSnap.data() || {};
        const slotIds = normalizeSlotIds(bookingData.slotIds);

        const slotRefs = slotIds.map((slotId) => doc(db, "slots", slotId));
        const slotSnaps = await Promise.all(
          slotRefs.map((slotRef) => transaction.get(slotRef))
        );

        slotIds.forEach((slotId, index) => {
          const slotSnap = slotSnaps[index];
          if (!slotSnap || !slotSnap.exists()) {
            return;
          }

          const slotData = slotSnap.data() || {};
          const currentReserved = getSafeReservedCount(slotData, 0);
          const nextReserved = Math.max(0, currentReserved - 1);

          transaction.set(
            doc(db, "slots", slotId),
            { reservedCount: nextReserved },
            { merge: true }
          );
        });

        transaction.delete(bookingRef);
      });

      const nextNotice = buildNotice(
        "[취소 공지]",
        booking.name,
        booking.phone || "연락처 없음",
        booking.slotIds || []
      );

      setNoticeText(nextNotice);
      await saveSettings({ lastNoticeText: nextNotice });

      if (editingId === bookingId) resetForm();
      setTab("notice");
    } catch (error) {
      setFormError("취소 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function addSlot() {
    if (!newDate) return;
    const slotDocs = buildSlotsFromAdminSelection(newDate, newTimeKey);
    if (slotDocs.length === 0) return;

    for (const slot of slotDocs) {
      const existingSlot = slots.find((item) => item.id === slot.id);
      const payload = {
        date: slot.date,
        start: slot.start,
        end: slot.end,
      };

      if (
        !existingSlot ||
        typeof existingSlot.reservedCount !== "number" ||
        existingSlot.reservedCount < 0
      ) {
        payload.reservedCount = 0;
      }

      await setDoc(doc(db, "slots", slot.id), payload, { merge: true });
    }

    setNoticeText(
      newTimeKey === "ALL_DAY"
        ? `${formatDate(
            newDate
          )} 날짜에 8개의 1시간 슬롯이 관리자 설정에서 자동 생성되었습니다.`
        : `${formatDate(newDate)} ${slotDocs[0].start}~${
            slotDocs[0].end
          } 시간이 추가되었습니다.`
    );

    setNewDate("");
    setNewTimeKey("09:00-10:00");
  }

  async function deleteSlotById(slotId) {
    await deleteDoc(doc(db, "slots", slotId));
    const affected = bookings.filter((booking) =>
      booking.slotIds?.includes(slotId)
    );
    for (const booking of affected) {
      const nextIds = booking.slotIds.filter((id) => id !== slotId);
      if (nextIds.length === 0) {
        await deleteDoc(doc(db, "bookings", booking.id));
      } else {
        await updateDoc(doc(db, "bookings", booking.id), {
          slotIds: nextIds,
          updatedAt: nowStamp(),
        });
      }
    }
  }

  async function saveSettings(nextSettings) {
    await setDoc(doc(db, "settings", "app"), nextSettings, { merge: true });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        window.location.href || "https://codesandbox.io"
      );
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      setLinkCopied(false);
    }
  }

  async function clearLastNotice() {
    await saveSettings({ lastNoticeText: "" });
    setNoticeText("");
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedInitialData();
      setNoticeText("초기 시간대와 기본 설정이 Firebase에 저장되었습니다.");
    } finally {
      setSeeding(false);
    }
  }

  async function handleAdminAccess() {
    setAdminError("");
    if (!settings.ownerPassword) {
      if (!newOwnerPassword.trim())
        return setAdminError("처음 설정할 관리자 비밀번호를 입력해 주세요.");
      const next = { ...settings, ownerPassword: newOwnerPassword.trim() };
      await saveSettings(next);
      setSettings(next);
      setIsAdminUnlocked(true);
      setNewOwnerPassword("");
      return;
    }
    if (adminInputPassword.trim() !== settings.ownerPassword)
      return setAdminError("관리자 비밀번호가 올바르지 않습니다.");
    setIsAdminUnlocked(true);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: 20,
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{ display: "grid", gap: 20, gridTemplateColumns: "1.4fr 1fr" }}
        >
          <div
            style={{
              ...cardStyle(),
              gridColumn: "1 / -1",
              border: "3px solid #0f172a",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1 style={{ fontSize: 40, margin: 0, lineHeight: 1.3 }}>
                  {settings.title}
                </h1>
                <p style={{ fontSize: 22, color: "#475569", lineHeight: 1.6 }}>
                  {settings.description}
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: 10,
                  }}
                >
                  {hashtagItems.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        background: "#e2e8f0",
                        borderRadius: 999,
                        padding: "10px 16px",
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                ...cardStyle({
                  marginTop: 18,
                  background: "#f8fafc",
                  boxShadow: "none",
                  border: "2px solid #e2e8f0",
                }),
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 800 }}>
                로그인 없이 일정 신청 가능
              </div>
              <div style={{ fontSize: 18, color: "#475569", marginTop: 6 }}>
                이 링크를 받은 사람은 바로 신청, 변경, 취소가 가능합니다.
              </div>
            </div>

            {loading && (
              <div style={{ marginTop: 16, fontSize: 18, color: "#475569" }}>
                Firebase에서 데이터를 불러오는 중입니다...
              </div>
            )}
          </div>
        </div>

        <div
          style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}
        >
          {[
            ["live", "실시간 현황"],
            ["manage", "신청 / 변경"],
            ["notice", "담당자 안내"],
            ["admin", "운영 설정"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                ...buttonStyle(tab === key),
                minWidth: 170,
                fontSize: 22,
                padding: "16px 20px",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "live" && (
          <div style={{ display: "grid", gap: 20, marginTop: 20 }}>
            <div style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>실시간 신청 현황</h2>
              <CalendarGrid slots={slotStats} />
            </div>

            <div style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>날짜별 보기</h2>
              <div style={{ display: "grid", gap: 16 }}>
                {groupedByDate.map(([date, daySlots]) => (
                  <div
                    key={date}
                    style={{
                      ...cardStyle({
                        padding: 20,
                        boxShadow: "none",
                        border: "1px solid #e2e8f0",
                      }),
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 800 }}>
                      {formatDate(date)}
                    </div>
                    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                      {daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            background: "#f8fafc",
                            padding: 14,
                            borderRadius: 16,
                            fontSize: 18,
                          }}
                        >
                          <span>
                            {slot.start}~{slot.end}
                          </span>
                          <b>
                            {slot.bookedCount}/{SLOT_CAPACITY}명
                          </b>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "manage" && (
          <div
            style={{
              display: "grid",
              gap: 20,
              marginTop: 20,
            }}
          >
            <div ref={manageTopRef} style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>
                {editingId ? "내 일정 변경" : "새 일정 신청"}
              </h2>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  이름
                </div>
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="예: 홍길동"
                  style={{
                    width: "100%",
                    height: 56,
                    fontSize: 22,
                    borderRadius: 16,
                    border: "1px solid #cbd5e1",
                    padding: "0 16px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  연락처
                </div>
                <input
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  style={{
                    width: "100%",
                    height: 56,
                    fontSize: 22,
                    borderRadius: 16,
                    border: "1px solid #cbd5e1",
                    padding: "0 16px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 20,
                  padding: 18,
                  fontSize: 20,
                  lineHeight: 1.7,
                }}
              >
                <div>
                  <b>현재 선택 시간:</b> {selectedSlotIds.length}시간
                </div>
                <div>
                  <b>선택 가능한 시간 기:</b> {MONTHLY_MIN_HOURS}시간 이상{" "}
                  {MONTHLY_MAX_HOURS}시간 이하
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  {selectedSlotIds.length < MONTHLY_MIN_HOURS
                    ? `${
                        MONTHLY_MIN_HOURS - selectedSlotIds.length
                      }시간 더 선택해야 합니다.`
                    : selectedSlotIds.length > MONTHLY_MAX_HOURS
                    ? `${
                        selectedSlotIds.length - MONTHLY_MAX_HOURS
                      }시간 초과되었습니다.`
                    : "현재 시간은 허용 범위 안에 있습니다."}
                </div>
              </div>

              {formError && (
                <div
                  style={{
                    marginTop: 14,
                    background: "#fef2f2",
                    color: "#b91c1c",
                    border: "1px solid #fecaca",
                    borderRadius: 18,
                    padding: 16,
                    fontSize: 18,
                  }}
                >
                  {formError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 16,
                  flexWrap: "wrap",
                }}
              >
                <button onClick={saveBooking} style={buttonStyle(true)}>
                  {editingId ? "변경 저장" : "신청 저장"}
                </button>
                <button onClick={resetForm} style={buttonStyle(false)}>
                  초기화
                </button>
              </div>
            </div>

            <div style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>
                1시간 단위 시간 선택
              </h2>
              <div style={{ fontSize: 18, color: "#64748b", marginBottom: 14 }}>
                운영 설정에서 오후 5시~6시를 추가하면 그 1개 슬롯이 보이고, 전체
                시간을 추가하면 같은 방식으로 해당 날짜의 8개 1시간 슬롯이
                이곳에 생성됩니다.
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                {slotStats.map((slot) => {
                  const active = selectedSlotIds.includes(slot.id);
                  const disabled = slot.bookedCount >= SLOT_CAPACITY && !active;
                  return (
                    <button
                      key={slot.id}
                      onClick={() => !disabled && toggleSlot(slot.id)}
                      style={{
                        textAlign: "left",
                        borderRadius: 20,
                        border: active
                          ? "2px solid #0f172a"
                          : "1px solid #cbd5e1",
                        background: active
                          ? "#0f172a"
                          : disabled
                          ? "#e2e8f0"
                          : "#ffffff",
                        color: active ? "#ffffff" : "#0f172a",
                        padding: 18,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}
                    >
                      <div style={{ fontSize: 22, fontWeight: 800 }}>
                        {formatDate(slot.date)}
                      </div>
                      <div style={{ fontSize: 20, marginTop: 8 }}>
                        {slot.start}~{slot.end}
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          marginTop: 10,
                          opacity: active ? 0.9 : 1,
                        }}
                      >
                        현재 {slot.bookedCount}/{SLOT_CAPACITY}명 · 잔여{" "}
                        {slot.remaining}명
                      </div>
                      {disabled && (
                        <div
                          style={{
                            fontSize: 18,
                            marginTop: 8,
                            fontWeight: 700,
                          }}
                        >
                          이 시간은 마감되었습니다.
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ ...cardStyle(), gridColumn: "1 / -1" }}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>신청자 목록</h2>
              <div style={{ display: "grid", gap: 14 }}>
                {bookingSummaries.map((booking) => {
  const bookingDateCards = buildBookingDateCards(booking.slotIds, slots);

  return (
    <div
      key={booking.id}
      style={{
        ...cardStyle({
          padding: 20,
          boxShadow: "none",
          border: "1px solid #e2e8f0",
        }),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {booking.name}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#64748b",
              marginTop: 6,
            }}
          >
            연락처: {booking.phone || "-"}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#64748b",
              marginTop: 6,
            }}
          >
            최근 수정: {booking.updatedAt}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            <span
              style={{
                background: "#e2e8f0",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              이번 달 신청 시간 {booking.totalHours}
            </span>
            <span
              style={{
                background: "#f1f5f9",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              상태: {booking.status}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={buttonStyle(false)}
            onClick={() => startEdit(booking.id)}
          >
            변경
          </button>
          <button
            style={buttonStyle(false)}
            onClick={() => cancelBooking(booking.id)}
          >
            취소
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        {bookingDateCards.length > 0 ? (
          bookingDateCards.map((item) => (
            <div
              key={item.date}
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  marginBottom: 10,
                }}
              >
                {formatDate(item.date)}
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {item.ranges.map((range, index) => (
                  <div
                    key={`${item.date}-${index}`}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: 12,
                      padding: "8px 10px",
                      fontSize: 17,
                      fontWeight: 700,
                    }}
                  >
                    {range.start} ~ {range.end}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              gridColumn: "1 / -1",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 16,
              fontSize: 17,
              color: "#64748b",
            }}
          >
            신청한 시간이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
})}

        {tab === "admin" && (
          <div style={{ marginTop: 20 }}>
            {!isAdminUnlocked ? (
              <div style={{ ...cardStyle(), maxWidth: 680, margin: "0 auto" }}>
                <h2 style={{ fontSize: 32, marginTop: 0 }}>
                  운영 설정 페이지 잠금
                </h2>
                {!settings.ownerPassword ? (
                  <>
                    <div
                      style={{
                        fontSize: 20,
                        color: "#475569",
                        lineHeight: 1.7,
                        marginBottom: 14,
                      }}
                    >
                      아직 관리자 비밀번호가 없습니다. 원소유자만 처음 1회
                      비밀번호를 설정하세요.
                    </div>
                    <input
                      type="password"
                      value={newOwnerPassword}
                      onChange={(e) => setNewOwnerPassword(e.target.value)}
                      placeholder="처음 설정할 관리자 비밀번호"
                      style={{
                        width: "100%",
                        height: 56,
                        fontSize: 22,
                        borderRadius: 16,
                        border: "1px solid #cbd5e1",
                        padding: "0 16px",
                        boxSizing: "border-box",
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 20,
                        color: "#475569",
                        lineHeight: 1.7,
                        marginBottom: 14,
                      }}
                    >
                      운영 설정 페이지는 관리자 비밀번호 입력 시에만 열립니다.
                    </div>
                    <input
                      type="password"
                      value={adminInputPassword}
                      onChange={(e) => setAdminInputPassword(e.target.value)}
                      placeholder="관리자 비밀번호 입력"
                      style={{
                        width: "100%",
                        height: 56,
                        fontSize: 22,
                        borderRadius: 16,
                        border: "1px solid #cbd5e1",
                        padding: "0 16px",
                        boxSizing: "border-box",
                      }}
                    />
                  </>
                )}
                {adminError && (
                  <div
                    style={{
                      marginTop: 14,
                      background: "#fef2f2",
                      color: "#b91c1c",
                      border: "1px solid #fecaca",
                      borderRadius: 18,
                      padding: 16,
                      fontSize: 18,
                    }}
                  >
                    {adminError}
                  </div>
                )}
               <div
  style={{
    display: "flex",
    gap: 10,
    marginTop: 16,
    flexWrap: "wrap",
  }}
>
  <button style={buttonStyle(true)} onClick={handleAdminAccess}>
    {!settings.ownerPassword
      ? "관리자 비밀번호 저장"
      : "운영 설정 열기"}
  </button>
</div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 20,
                  gridTemplateColumns: "0.95fr 1.05fr",
                }}
              >
                <div style={cardStyle()}>
                  <h2 style={{ fontSize: 32, marginTop: 0 }}>운영 기본 설정</h2>
                  <div style={{ display: "grid", gap: 14 }}>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        페이지 제목
                      </div>
                      <input
                        value={settings.title}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          height: 56,
                          fontSize: 22,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: "0 16px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        설명
                      </div>
                      <input
                        value={settings.description}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          height: 56,
                          fontSize: 22,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: "0 16px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        표시할 해시태그 문구
                      </div>
                      <textarea
                        value={settings.hashtags}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            hashtags: e.target.value,
                          }))
                        }
                        placeholder="예: √월 최소 40시간  √일일 최대 정원 7명"
                        style={{
                          width: "100%",
                          minHeight: 100,
                          fontSize: 20,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: 16,
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        관리자 안내 문구
                      </div>
                      <textarea
                        value={settings.adminNoticeTemplate}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            adminNoticeTemplate: e.target.value,
                          }))
                        }
                        placeholder="예: 변경 또는 취소 후 관리자에게 꼭 연락해 주세요."
                        style={{
                          width: "100%",
                          minHeight: 100,
                          fontSize: 20,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: 16,
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        관리자 연락처
                      </div>
                      <input
                        value={settings.adminContact}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            adminContact: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          height: 56,
                          fontSize: 22,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: "0 16px",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        링크 복사 (관리자 전용)
                      </div>
                      <button style={buttonStyle(true)} onClick={copyLink}>
                        링크 복사 {linkCopied ? "완료" : ""}
                      </button>
                    </div>
                    <button
                      style={buttonStyle(true)}
                      onClick={() => saveSettings(settings)}
                    >
                      운영 설정 저장
                    </button>
                    <div
                      style={{
                        background: "#0f172a",
                        color: "#ffffff",
                        borderRadius: 20,
                        padding: 20,
                        fontSize: 20,
                        lineHeight: 1.7,
                        minHeight: 160,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {settings.lastNoticeText || "자동 공지가 아직 없습니다."}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button style={buttonStyle(false)} onClick={clearLastNotice}>
                        자동 공지 초기화
                      </button>
                    </div>

                    <div
                      style={{
                        background: "#f8fafc",
                        borderRadius: 20,
                        padding: 18,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          marginBottom: 12,
                        }}
                      >
                        새 시간대 추가
                      </div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <input
                          type="date"
                          value={newDate}
                          onChange={(e) => setNewDate(e.target.value)}
                          style={{
                            width: "100%",
                            height: 56,
                            fontSize: 22,
                            borderRadius: 16,
                            border: "1px solid #cbd5e1",
                            padding: "0 16px",
                            boxSizing: "border-box",
                          }}
                        />
                        <select
                          value={newTimeKey}
                          onChange={(e) => setNewTimeKey(e.target.value)}
                          style={{
                            width: "100%",
                            height: 56,
                            fontSize: 22,
                            borderRadius: 16,
                            border: "1px solid #cbd5e1",
                            padding: "0 16px",
                            boxSizing: "border-box",
                          }}
                        >
                          {TIME_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <button onClick={addSlot} style={buttonStyle(true)}>
                          시간 추가
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          color: "#64748b",
                          marginTop: 10,
                        }}
                      >
                        전체 시간을 선택하면 아래 8개 신청 버튼이 생성됩니다.
                      </div>
                    </div>
                  </div>
                </div>

                <div style={cardStyle()}>
                  <h2 style={{ fontSize: 32, marginTop: 0 }}>
                    관리자 전용 통계
                  </h2>
                  <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                    {bookingSummaries.map((person) => {
                      const percent = Math.min(
                        (person.totalHours / MONTHLY_MAX_HOURS) * 100,
                        100
                      );
                      return (
                        <div
                          key={person.id}
                          style={{
                            ...cardStyle({
                              padding: 18,
                              boxShadow: "none",
                              border: "1px solid #e2e8f0",
                              background: "#f8fafc",
                            }),
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 22, fontWeight: 800 }}>
                                {person.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 17,
                                  color: "#64748b",
                                  marginTop: 6,
                                }}
                              >
                                연락처: {person.phone || "-"}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 24, fontWeight: 800 }}>
                                {person.totalHours}시간
                              </div>
                              <div
                                style={{
                                  fontSize: 16,
                                  color: "#475569",
                                  marginTop: 4,
                                }}
                              >
                                상태: {person.status}
                              </div>
                            </div>
                          </div>
                          <div
                            style={{
                              height: 12,
                              background: "#e2e8f0",
                              borderRadius: 999,
                              overflow: "hidden",
                              marginTop: 12,
                            }}
                          >
                            <div
                              style={{
                                width: `${percent}%`,
                                height: "100%",
                                background: "#0f172a",
                              }}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 16,
                              color: "#64748b",
                              marginTop: 8,
                            }}
                          >
                            월 기준 {MONTHLY_MIN_HOURS}시간 ~{" "}
                            {MONTHLY_MAX_HOURS}시간
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <h2 style={{ fontSize: 32, marginTop: 0 }}>
                    전체 시간대 목록
                  </h2>
                  <div style={{ display: "grid", gap: 14 }}>
                    {slotStats.map((slot) => (
                      <div
                        key={slot.id}
                        style={{
                          ...cardStyle({
                            padding: 18,
                            boxShadow: "none",
                            border: "1px solid #e2e8f0",
                          }),
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 22, fontWeight: 800 }}>
                              {slotText(slot)}
                            </div>
                            <div
                              style={{
                                fontSize: 18,
                                color: "#64748b",
                                marginTop: 6,
                              }}
                            >
                              현재 {slot.bookedCount}/{SLOT_CAPACITY}명
                            </div>
                          </div>
                          <button
                            style={buttonStyle(false)}
                            onClick={() => deleteSlotById(slot.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
