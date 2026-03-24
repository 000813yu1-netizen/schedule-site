
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
import { getDocs } from "firebase/firestore";

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
const HOURS_PER_SLOT = 4;

const SLOT_DEFINITIONS = [
  {
    key: "MORNING_1",
    label: "오전1",
    displayTime: "9시~13시",
    start: "09:00",
    end: "13:00",
    segments: ["09:00-10:00", "10:00-13:00"],
  },
  {
    key: "MORNING_2",
    label: "오전2",
    displayTime: "10시~14시",
    start: "10:00",
    end: "14:00",
    segments: ["10:00-13:00", "13:00-14:00"],
  },
  {
    key: "AFTERNOON_1",
    label: "오후1",
    displayTime: "13시~17시",
    start: "13:00",
    end: "17:00",
    segments: ["13:00-14:00", "14:00-17:00"],
  },
  {
    key: "AFTERNOON_2",
    label: "오후2",
    displayTime: "14시~18시",
    start: "14:00",
    end: "18:00",
    segments: ["14:00-17:00", "17:00-18:00"],
  },
];

const SLOT_KEY_ORDER = SLOT_DEFINITIONS.map((slot) => slot.key);
const SLOT_KEY_TO_DEF = Object.fromEntries(
  SLOT_DEFINITIONS.map((slot) => [slot.key, slot])
);

const TIME_OPTIONS = [
  ...SLOT_DEFINITIONS.map((slot) => ({
    label: `${slot.label} (${slot.displayTime})`,
    value: slot.key,
  })),
  { label: "전체 시간", value: "ALL_DAY" },
];

const ALLOWED_DOUBLE_SLOT_KEYS = new Set([
  ["MORNING_1", "AFTERNOON_2"].sort().join("|")
]);
const INVALID_COMBO_MESSAGE = `8시간 선택은 오전1 + 오후2만 가능합니다.\n(9시~13시 / 14시~18시)`;

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

function getSlotDefinition(slotOrKey) {
  if (!slotOrKey) return null;
  if (typeof slotOrKey === "string") return SLOT_KEY_TO_DEF[slotOrKey] || null;
  return SLOT_KEY_TO_DEF[slotOrKey.slotKey] || null;
}

function buildSlotDoc(date, slotKey) {
  const definition = getSlotDefinition(slotKey);
  if (!date || !definition) return null;

  return {
    id: `${date}-${definition.key}`,
    date,
    slotKey: definition.key,
    label: definition.label,
    displayTime: definition.displayTime,
    start: definition.start,
    end: definition.end,
  };
}

function buildSlotsFromAdminSelection(date, timeKey) {
  if (!date || !timeKey) return [];

  if (timeKey === "ALL_DAY") {
    return SLOT_DEFINITIONS.map((definition) => buildSlotDoc(date, definition.key));
  }

  const slotDoc = buildSlotDoc(date, timeKey);
  return slotDoc ? [slotDoc] : [];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function slotSummaryText(slot) {
  const label = slot?.label || getSlotDefinition(slot)?.label || "";
  const displayTime =
    slot?.displayTime || getSlotDefinition(slot)?.displayTime || "";
  return `${label} (${displayTime})`;
}

function slotText(slot) {
  return `${formatDate(slot.date)} ${slotSummaryText(slot)}`;
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

function normalizeSlotIds(slotIds) {
  if (!Array.isArray(slotIds)) return [];
  return [...new Set(slotIds.filter((id) => typeof id === "string" && id.trim()))];
}

function buildSlotsByIdMap(slots) {
  return Object.fromEntries(
    slots.map((slot) => [
      slot.id,
      {
        ...slot,
        ...(getSlotDefinition(slot) || {}),
      },
    ])
  );
}

function buildOccupancyMap(bookings, slotsById) {
  const occupancy = {};

  bookings.forEach((booking) => {
    normalizeSlotIds(booking.slotIds).forEach((slotId) => {
      const slot = slotsById[slotId];
      const definition = getSlotDefinition(slot);
      if (!slot || !definition) return;

      definition.segments.forEach((segment) => {
        if (!occupancy[slot.date]) occupancy[slot.date] = {};
        occupancy[slot.date][segment] = (occupancy[slot.date][segment] || 0) + 1;
      });
    });
  });

  return occupancy;
}

function getSlotRemaining(slot, occupancyMap) {
  const definition = getSlotDefinition(slot);
  if (!definition) return 0;
  const segments = definition.segments || [];
  const remainingCounts = segments.map((segment) => {
    const occupied = occupancyMap?.[slot.date]?.[segment] || 0;
    return SLOT_CAPACITY - occupied;
  });
  return Math.max(0, Math.min(...remainingCounts, SLOT_CAPACITY));
}

function getCapacityConflictDates(bookings, slotsById) {
  const occupancy = buildOccupancyMap(bookings, slotsById);
  const conflictDates = new Set();

  Object.entries(occupancy).forEach(([date, segmentMap]) => {
    const hasConflict = Object.values(segmentMap).some(
      (count) => count > SLOT_CAPACITY
    );
    if (hasConflict) conflictDates.add(date);
  });

  return conflictDates;
}

function getSelectionKeysForDate(slotIds, slotsById, date) {
  return normalizeSlotIds(slotIds)
    .map((id) => slotsById[id])
    .filter((slot) => slot && slot.date === date)
    .sort(
      (a, b) => SLOT_KEY_ORDER.indexOf(a.slotKey) - SLOT_KEY_ORDER.indexOf(b.slotKey)
    )
    .map((slot) => slot.slotKey);
}

function isValidDateSelection(slotKeys) {
  if (slotKeys.length === 0) return true;
  if (slotKeys.length === 1) return true;
  if (slotKeys.length > 2) return false;
  const joined = [...slotKeys].sort().join("|");
  return ALLOWED_DOUBLE_SLOT_KEYS.has(joined);
}

function formatHoursLabel(hours) {
  return `${hours}시간`;
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
        const daySlots = [...grouped[date]].sort(
          (a, b) =>
            SLOT_KEY_ORDER.indexOf(a.slotKey) - SLOT_KEY_ORDER.indexOf(b.slotKey)
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
                const isFull = slot.remaining <= 0;
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
                      minHeight: 176,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 23, fontWeight: 800 }}>{slot.label}</div>
                      <div
                        style={{ fontSize: 18, color: "#475569", marginTop: 6 }}
                      >
                        {slot.displayTime}
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
                      <div
                        style={{
                          fontSize: 16,
                          color: "#475569",
                          marginTop: 8,
                        }}
                      >
                        잔여 {slot.remaining}명
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
  const [dateSelectionWarnings, setDateSelectionWarnings] = useState({});
  const [newDate, setNewDate] = useState("");
  const [newTimeKey, setNewTimeKey] = useState("MORNING_1");
  const [loading, setLoading] = useState(true);
  const [adminInputPassword, setAdminInputPassword] = useState("");
  const [newOwnerPassword, setNewOwnerPassword] = useState("");
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedDeleteBookingId, setSelectedDeleteBookingId] = useState("");
  const [deleteBookingError, setDeleteBookingError] = useState("");
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
        const next = snapshot.docs
          .map((item) => {
            const data = item.data();
            const definition = getSlotDefinition(data.slotKey || item.id.split("-").pop());
            return {
              id: item.id,
              ...data,
              ...(definition || {}),
              label: data.label || definition?.label || "",
              displayTime: data.displayTime || definition?.displayTime || "",
              start: data.start || definition?.start || "",
              end: data.end || definition?.end || "",
              slotKey: data.slotKey || definition?.key || "",
            };
          })
          .filter((slot) => Boolean(slot.slotKey));

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

  useEffect(() => {
    if (
      selectedDeleteBookingId &&
      !bookings.some((item) => item.id === selectedDeleteBookingId)
    ) {
      setSelectedDeleteBookingId("");
    }
  }, [bookings, selectedDeleteBookingId]);

  const slotsById = useMemo(() => buildSlotsByIdMap(slots), [slots]);

  const occupancyMap = useMemo(() => {
    return buildOccupancyMap(bookings, slotsById);
  }, [bookings, slotsById]);

  const slotStats = useMemo(() => {
    return [...slots]
      .map((slot) => {
        const members = bookings.filter((booking) =>
          normalizeSlotIds(booking.slotIds).includes(slot.id)
        );

        return {
          ...slot,
          bookedCount: members.length,
          remaining: getSlotRemaining(slot, occupancyMap),
          memberNames: members.map((member) => member.name),
        };
      })
      .sort((a, b) => {
        const dateDiff = a.date.localeCompare(b.date);
        if (dateDiff !== 0) return dateDiff;
        return SLOT_KEY_ORDER.indexOf(a.slotKey) - SLOT_KEY_ORDER.indexOf(b.slotKey);
      });
  }, [slots, bookings, occupancyMap]);

  const bookingSummaries = useMemo(() => {
    return bookings
      .map((booking) => {
        const totalHours = normalizeSlotIds(booking.slotIds).length * HOURS_PER_SLOT;
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

    return Object.entries(map).map(([date, daySlots]) => [
      date,
      [...daySlots].sort(
        (a, b) => SLOT_KEY_ORDER.indexOf(a.slotKey) - SLOT_KEY_ORDER.indexOf(b.slotKey)
      ),
    ]);
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
    setDateSelectionWarnings({});
  }

  function clearDateWarning(date) {
    setDateSelectionWarnings((prev) => {
      if (!prev[date]) return prev;
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }

  function toggleSlot(slotId) {
    setFormError("");

    const slot = slotStats.find((item) => item.id === slotId);
    if (!slot) return;

    const isSelected = selectedSlotIds.includes(slotId);

    if (isSelected) {
      const nextIds = selectedSlotIds.filter((id) => id !== slotId);
      setSelectedSlotIds(nextIds);
      clearDateWarning(slot.date);
      return;
    }

    if (slot.remaining <= 0) return;

    const candidateIds = [...selectedSlotIds, slotId];
    const sameDateKeys = getSelectionKeysForDate(candidateIds, slotsById, slot.date);

    if (!isValidDateSelection(sameDateKeys)) {
      setDateSelectionWarnings((prev) => ({
        ...prev,
        [slot.date]: INVALID_COMBO_MESSAGE,
      }));
      return;
    }

    clearDateWarning(slot.date);
    setSelectedSlotIds(candidateIds);
  }

  function buildNotice(prefix, personName, personPhone, slotIds) {
    const slotInfo = normalizeSlotIds(slotIds)
      .map((id) => slotsById[id])
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date) || SLOT_KEY_ORDER.indexOf(a.slotKey) - SLOT_KEY_ORDER.indexOf(b.slotKey))
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
    const totalHours = nextSelectedSlotIds.length * HOURS_PER_SLOT;

    setFormError("");

    if (!trimmedName) return setFormError("이름을 입력해 주세요.");
    if (!trimmedPhone) return setFormError("연락처를 입력해 주세요.");
    if (nextSelectedSlotIds.length === 0)
      return setFormError("시간을 1개 이상 선택해 주세요.");

    const selectedDateMap = {};
    nextSelectedSlotIds.forEach((slotId) => {
      const slot = slotsById[slotId];
      if (!slot) return;
      if (!selectedDateMap[slot.date]) selectedDateMap[slot.date] = [];
      selectedDateMap[slot.date].push(slot.slotKey);
    });

    const invalidDate = Object.entries(selectedDateMap).find(([, slotKeys]) => {
      const orderedKeys = [...slotKeys].sort(
        (a, b) => SLOT_KEY_ORDER.indexOf(a) - SLOT_KEY_ORDER.indexOf(b)
      );
      return !isValidDateSelection(orderedKeys);
    });

    if (invalidDate) {
      const [date] = invalidDate;
      setDateSelectionWarnings((prev) => ({
        ...prev,
        [date]: INVALID_COMBO_MESSAGE,
      }));
      return setFormError("선택할 수 없는 8시간 조합이 포함되어 있습니다.");
    }

    if (totalHours < MONTHLY_MIN_HOURS || totalHours > MONTHLY_MAX_HOURS) {
      return setFormError(
        `한 달에 ${MONTHLY_MIN_HOURS}시간 이상 ${MONTHLY_MAX_HOURS}시간 이하로 맞춰야 합니다.`
      );
    }

    try {
      const allBookingsSnap = await getDocs(collection(db, "bookings"));
      const preFetchedBookings = allBookingsSnap.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      await runTransaction(db, async (transaction) => {
        const bookingRef = editingId
          ? doc(db, "bookings", editingId)
          : doc(collection(db, "bookings"));

        if (editingId) {
          const bookingSnap = await transaction.get(bookingRef);
          if (!bookingSnap.exists()) {
            throw new Error("BOOKING_NOT_FOUND");
          }
        }

       // 🔥 transaction 밖에서 미리 가져온 bookings 사용
        const virtualBookings = preFetchedBookings;

        const nextPayload = {
          id: bookingRef.id,
          name: trimmedName,
          phone: trimmedPhone,
          slotIds: nextSelectedSlotIds,
          updatedAt: nowStamp(),
        };

        const hasAllSlots = nextSelectedSlotIds.every((slotId) => Boolean(slotsById[slotId]));
        if (!hasAllSlots) {
          throw new Error("SLOT_NOT_FOUND");
        }

        const nextBookings = editingId
          ? virtualBookings.map((booking) =>
              booking.id === editingId ? nextPayload : booking
            )
          : [...virtualBookings, nextPayload];

        const conflictDates = getCapacityConflictDates(nextBookings, slotsById);
        if (conflictDates.size > 0) {
          throw new Error("TIME_OVER_CAPACITY");
        }

        transaction.set(
          bookingRef,
          {
            name: trimmedName,
            phone: trimmedPhone,
            slotIds: nextSelectedSlotIds,
            slotSummaries: nextSelectedSlotIds
              .map((slotId) => {
                const slot = slotsById[slotId];
                if (!slot) return null;
                return {
                  slotId,
                  label: slot.label,
                  displayTime: slot.displayTime,
                  start: slot.start,
                  end: slot.end,
                  date: slot.date,
                };
              })
              .filter(Boolean),
            updatedAt: nowStamp(),
          },
          { merge: true }
        );
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
      if (error?.message === "TIME_OVER_CAPACITY") {
        setFormError("겹치는 시간대 인원이 7명을 초과해 저장할 수 없습니다.");
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
    setDateSelectionWarnings({});
    setTab("manage");
    setTimeout(() => {
      manageTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  async function deleteBookingWithCounts(bookingId) {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) {
      throw new Error("BOOKING_NOT_FOUND");
    }

    await deleteDoc(doc(db, "bookings", bookingId));

    const nextNotice = buildNotice(
      "[취소 공지]",
      booking.name,
      booking.phone || "연락처 없음",
      booking.slotIds || []
    );

    setNoticeText(nextNotice);
    await saveSettings({ lastNoticeText: nextNotice });

    return booking;
  }

  async function cancelBooking(bookingId) {
    try {
      await deleteBookingWithCounts(bookingId);

      if (editingId === bookingId) resetForm();
      setTab("notice");
    } catch (error) {
      setFormError("취소 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function handleAdminDeleteBooking() {
    setDeleteBookingError("");

    if (!selectedDeleteBookingId) {
      setDeleteBookingError("삭제할 신청자를 먼저 선택해 주세요.");
      return;
    }

    try {
      await deleteBookingWithCounts(selectedDeleteBookingId);

      if (editingId === selectedDeleteBookingId) resetForm();
      setSelectedDeleteBookingId("");
    } catch (error) {
      if (error?.message === "BOOKING_NOT_FOUND") {
        setDeleteBookingError("삭제할 신청 정보를 찾을 수 없습니다.");
        setSelectedDeleteBookingId("");
        return;
      }
      setDeleteBookingError("신청 내역 삭제 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  async function addSlot() {
    if (!newDate) return;
    const slotDocs = buildSlotsFromAdminSelection(newDate, newTimeKey);
    if (slotDocs.length === 0) return;

    for (const slot of slotDocs) {
      await setDoc(
        doc(db, "slots", slot.id),
        {
          date: slot.date,
          slotKey: slot.slotKey,
          label: slot.label,
          displayTime: slot.displayTime,
          start: slot.start,
          end: slot.end,
        },
        { merge: true }
      );
    }

    setNoticeText(
      newTimeKey === "ALL_DAY"
        ? `${formatDate(newDate)} 날짜에 4개의 4시간 슬롯이 관리자 설정에서 자동 생성되었습니다.`
        : `${formatDate(newDate)} ${slotDocs[0].label}(${slotDocs[0].displayTime}) 시간이 추가되었습니다.`
    );

    setNewDate("");
    setNewTimeKey("MORNING_1");
  }

  async function deleteSlotById(slotId) {
    await deleteDoc(doc(db, "slots", slotId));
    const affected = bookings.filter((booking) =>
      normalizeSlotIds(booking.slotIds).includes(slotId)
    );
    for (const booking of affected) {
      const nextIds = normalizeSlotIds(booking.slotIds).filter((id) => id !== slotId);
      if (nextIds.length === 0) {
        await deleteDoc(doc(db, "bookings", booking.id));
      } else {
        await updateDoc(doc(db, "bookings", booking.id), {
          slotIds: nextIds,
          slotSummaries: nextIds
            .map((id) => {
              const slot = slotsById[id];
              if (!slot) return null;
              return {
                slotId: id,
                label: slot.label,
                displayTime: slot.displayTime,
                start: slot.start,
                end: slot.end,
                date: slot.date,
              };
            })
            .filter(Boolean),
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

  const selectedTotalHours = selectedSlotIds.length * HOURS_PER_SLOT;

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
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800 }}>
                              {slot.label}
                            </div>
                            <div style={{ fontSize: 17, color: "#475569", marginTop: 4 }}>
                              {slot.displayTime}
                            </div>
                          </div>
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
                  <b>현재 선택 시간:</b> {formatHoursLabel(selectedTotalHours)}
                </div>
                <div>
                  <b>신청 기준:</b> {MONTHLY_MIN_HOURS}시간 이상{" "}
                  {MONTHLY_MAX_HOURS}시간 이하
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>
                  {selectedTotalHours < MONTHLY_MIN_HOURS
                    ? `${MONTHLY_MIN_HOURS - selectedTotalHours}시간 더 선택해야 합니다.`
                    : selectedTotalHours > MONTHLY_MAX_HOURS
                    ? `${selectedTotalHours - MONTHLY_MAX_HOURS}시간 초과되었습니다.`
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
                4시간 단위 시간 선택
              </h2>
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
                    <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 14 }}>
                      {formatDate(date)}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: 14,
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      {daySlots.map((slot) => {
                        const active = selectedSlotIds.includes(slot.id);
                        const disabled = slot.remaining <= 0 && !active;
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
                            <div style={{ fontSize: 24, fontWeight: 800 }}>
                              {slot.label}
                            </div>
                            <div style={{ fontSize: 19, marginTop: 8 }}>
                              {slot.displayTime}
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

                    {dateSelectionWarnings[date] && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: 16,
                          borderRadius: 18,
                          border: "1px solid #fca5a5",
                          background: "#fef2f2",
                          color: "#b91c1c",
                          whiteSpace: "pre-line",
                        }}
                      >
                        <div style={{ fontSize: 18, fontWeight: 800 }}>
                          8시간 선택은 오전1 + 오후2만 가능합니다.
                        </div>
                        <div style={{ fontSize: 17, marginTop: 6 }}>
                          (9시~13시 / 14시~18시)
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...cardStyle(), gridColumn: "1 / -1" }}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>신청자 목록</h2>
              <div style={{ display: "grid", gap: 14 }}>
                {bookingSummaries.map((booking) => (
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
                            월 누적 {booking.totalHours}시간
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
                      <div
                        style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
                      >
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
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 14,
                      }}
                    >
                      {normalizeSlotIds(booking.slotIds).map((id) => {
                        const slot = slotsById[id];
                        if (!slot) return null;
                        return (
                          <span
                            key={id}
                            style={{
                              border: "1px solid #cbd5e1",
                              borderRadius: 999,
                              padding: "8px 14px",
                              fontSize: 17,
                            }}
                          >
                            {formatDate(slot.date)} {slot.label} ({slot.displayTime})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "notice" && (
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "1fr 1fr",
              marginTop: 20,
            }}
          >
            <div style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>담당자 안내</h2>
              <div
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  borderRadius: 20,
                  padding: 20,
                  fontSize: 22,
                  lineHeight: 1.7,
                  minHeight: 180,
                  whiteSpace: "pre-line",
                }}
              >
                {settings.adminNoticeTemplate}
              </div>
            </div>

            <div style={cardStyle()}>
              <h2 style={{ fontSize: 32, marginTop: 0 }}>월 신청 시간</h2>
              <div style={{ display: "grid", gap: 14 }}>
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
                        }}
                      >
                        <div style={{ fontSize: 24, fontWeight: 800 }}>
                          {person.name}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                          {person.totalHours}시간
                        </div>
                      </div>
                      <div
                        style={{
                          height: 14,
                          background: "#e2e8f0",
                          borderRadius: 999,
                          overflow: "hidden",
                          marginTop: 14,
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
                          fontSize: 18,
                          color: "#64748b",
                          marginTop: 10,
                        }}
                      >
                        상태: {person.status} · 기준 {MONTHLY_MIN_HOURS}시간 ~{" "}
                        {MONTHLY_MAX_HOURS}시간
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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

                    <div
                      style={{
                        background: "#f8fafc",
                        borderRadius: 20,
                        padding: 18,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          marginBottom: 12,
                        }}
                      >
                        신청 내역 삭제
                      </div>

                      <select
                        value={selectedDeleteBookingId}
                        onChange={(e) => {
                          setSelectedDeleteBookingId(e.target.value);
                          setDeleteBookingError("");
                        }}
                        style={{
                          width: "100%",
                          height: 56,
                          fontSize: 20,
                          borderRadius: 16,
                          border: "1px solid #cbd5e1",
                          padding: "0 16px",
                          boxSizing: "border-box",
                          background: "#ffffff",
                        }}
                      >
                        <option value="">삭제할 신청자를 선택해 주세요</option>
                        {bookingSummaries.map((booking) => (
                          <option key={booking.id} value={booking.id}>
                            {booking.name} · {booking.phone || "연락처 없음"} ·{" "}
                            {booking.totalHours}시간
                          </option>
                        ))}
                      </select>

                      {deleteBookingError && (
                        <div
                          style={{
                            marginTop: 12,
                            background: "#fef2f2",
                            color: "#b91c1c",
                            border: "1px solid #fecaca",
                            borderRadius: 18,
                            padding: 14,
                            fontSize: 17,
                          }}
                        >
                          {deleteBookingError}
                        </div>
                      )}

                      <div style={{ marginTop: 12 }}>
                        <button
                          style={buttonStyle(false)}
                          onClick={handleAdminDeleteBooking}
                          disabled={!selectedDeleteBookingId}
                        >
                          신청 내역 삭제
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: 17,
                          color: "#64748b",
                          marginTop: 10,
                          lineHeight: 1.6,
                        }}
                      >
                        선택한 신청자의 예약 전체가 삭제되며, 연결된 시간대 정보도 함께 사라집니다.
                      </div>
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
                        전체 시간을 선택하면 아래 4개의 4시간 슬롯이 생성됩니다.
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
                              {formatDate(slot.date)} {slot.label} ({slot.displayTime})
                            </div>
                            <div
                              style={{
                                fontSize: 18,
                                color: "#64748b",
                                marginTop: 6,
                              }}
                            >
                              현재 {slot.bookedCount}/{SLOT_CAPACITY}명 · 잔여 {slot.remaining}명
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
