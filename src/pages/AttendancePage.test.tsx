/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import AttendancePage from "./AttendancePage";

// ── Shared mock state & test data ──────────────────────────────────────────
// vi.mock factories are hoisted above this module's imports, so everything the
// factory needs must live inside vi.hoisted.
const m = vi.hoisted(() => {
  const INST_ID = "00000000-0000-0000-0000-000000000001";
  const BATCH_A = "JEE 2025 - Batch A";
  const BATCH_B = "NEET 2025 - Batch B";

  const STUDENTS = [
    { id: "aaaaaaaa-0000-0000-0000-000000000001", name: "Aarav Gupta", enrollment_no: "MT-1001", batch_name: BATCH_A, phone: "9111111111", mother_phone: "", father_phone: "", guardian_phone: "", guardian_name: "" },
    { id: "aaaaaaaa-0000-0000-0000-000000000002", name: "Ananya Sharma", enrollment_no: "MT-1002", batch_name: BATCH_A, phone: "9222222222", mother_phone: "", father_phone: "", guardian_phone: "", guardian_name: "" },
    { id: "aaaaaaaa-0000-0000-0000-000000000003", name: "Rohan Mehta", enrollment_no: "MT-1003", batch_name: BATCH_A, phone: "9333333333", mother_phone: "", father_phone: "", guardian_phone: "", guardian_name: "" },
    { id: "bbbbbbbb-0000-0000-0000-000000000001", name: "Ishaan Verma", enrollment_no: "MT-2001", batch_name: BATCH_B, phone: "9444444444", mother_phone: "", father_phone: "", guardian_phone: "", guardian_name: "" },
    { id: "bbbbbbbb-0000-0000-0000-000000000002", name: "Priya Nair", enrollment_no: "MT-2002", batch_name: BATCH_B, phone: "9555555555", mother_phone: "", father_phone: "", guardian_phone: "", guardian_name: "" },
  ] as any[];

  // In-memory "attendance" table state (mutated by the mock insert/delete)
  const attendanceRows: any[] = [];
  const insertedPayloads: any[][] = [];
  const deletedStudentIds: string[][] = [];
  // Realtime callbacks registered for the attendance table (used to simulate
  // background refetches triggered by other devices).
  const attendanceCallbacks: any[] = [];
  // Counts every students-table read. NOTE: it increments when the query
  // resolves — i.e. it tracks fetchData invocations, not whether the component
  // actually applied the result (stale reads are discarded by the version
  // guard). Good enough for waiting on the linear post-save refetch.
  const studentsQueryCount = { value: 0 };

  return {
    INST_ID,
    BATCH_A,
    BATCH_B,
    STUDENTS,
    attendanceRows,
    insertedPayloads,
    deletedStudentIds,
    attendanceCallbacks,
    studentsQueryCount,
  };
});

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => {
  const { STUDENTS, attendanceRows, insertedPayloads, deletedStudentIds, attendanceCallbacks, studentsQueryCount } = m;

  const buildResult = (table: string, state: any) => {
    if (table === "students") {
      studentsQueryCount.value += 1;
      return { data: STUDENTS, error: null };
    }
    if (table === "attendance") {
      if (state.op === "insert") {
        const rows = Array.isArray(state.rows) ? state.rows : [state.rows];
        insertedPayloads.push(rows);
        attendanceRows.push(...rows);
        return { data: null, error: null };
      }
      if (state.op === "delete") {
        const ids: string[] = state.inIds || [];
        deletedStudentIds.push(ids);
        const kept = attendanceRows.filter((r) => !ids.includes(r.student_id));
        attendanceRows.length = 0;
        attendanceRows.push(...kept);
        return { data: null, error: null };
      }
      // The page queries .order("created_at", { ascending: false }) — mimic it
      // so the first matching row per student is the newest one.
      return {
        data: [...attendanceRows].sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        ),
        error: null,
      };
    }
    if (table === "marks") return { data: [], error: null };
    if (table === "exam_attendance") return { data: [], error: null };
    if (table === "institutes") return { data: { wallet_credits: 100 }, error: null };
    return { data: [], error: null };
  };

  // Fluent query builder: every chain method returns the same thenable object,
  // and `await`ing it resolves to `{ data, error }` like the real client.
  const createQuery = (table: string) => {
    const state: { op: string; rows?: any; inIds?: string[] } = { op: "select" };
    const query: any = {
      select: () => { state.op = "select"; return query; },
      eq: () => query,
      or: () => query,
      order: () => query,
      limit: () => query,
      in: (col: string, ids: string[]) => { if (col === "student_id") state.inIds = ids; return query; },
      maybeSingle: () => query,
      single: () => query,
      insert: (rows: any) => { state.op = "insert"; state.rows = rows; return query; },
      update: () => { state.op = "update"; return query; },
      delete: () => { state.op = "delete"; return query; },
      then: (resolve: any, reject?: any) => Promise.resolve(buildResult(table, state)).then(resolve, reject),
    };
    return query;
  };

  const createChannel = () => {
    const channel: any = {
      on: (_event: string, opts: any, cb: any) => {
        if (opts?.table === "attendance") attendanceCallbacks.push(cb);
        return channel;
      },
      subscribe: () => channel,
      unsubscribe: () => channel,
    };
    return channel;
  };

  return {
    isUuid: (val: string | null | undefined) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val || ""),
    supabase: {
      from: (table: string) => createQuery(table),
      channel: () => createChannel(),
      removeChannel: () => Promise.resolve(),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: m.INST_ID,
      name: "Test Admin",
      email: "admin@test.com",
      role: "admin",
      instituteName: "Test Institute",
      instituteId: m.INST_ID,
      pageAccess: {},
    },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

vi.mock("@/lib/whatsapp-socket", () => ({
  restSendMessage: vi.fn().mockResolvedValue({ success: true }),
  fetchSessionStatus: vi.fn().mockResolvedValue({ status: "connected" }),
  getSendDelayMs: () => 0,
}));

// ── Setup helpers ──────────────────────────────────────────────────────────
beforeAll(() => {
  // Radix dialogs (used by the summary popup) rely on these in some browsers.
  if (typeof ResizeObserver === "undefined") {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  m.attendanceRows.length = 0;
  m.insertedPayloads.length = 0;
  m.deletedStudentIds.length = 0;
  m.attendanceCallbacks.length = 0;
  m.studentsQueryCount.value = 0;
});

const rowFor = (name: string) => {
  // Anchored on the row's distinctive class (student rows use justify-between;
  // inner info/name wrappers don't) — more robust than climbing two levels.
  // NOTE: student names must be unique in the fixture.
  const row = screen.getByText(name).closest("div[class*='justify-between']");
  if (!row) throw new Error(`Could not find attendance row for "${name}"`);
  return row as HTMLElement;
};

const statusButton = (name: string, label: "P" | "A" | "L") =>
  within(rowFor(name)).getByRole("button", { name: label });

/** Assert the P/A/L button state for a visible student row. */
const assertStatus = (name: string, status: "present" | "absent" | "leave") => {
  const label = status === "present" ? "P" : status === "absent" ? "A" : "L";
  const activeClass = status === "present" ? "bg-success" : status === "absent" ? "bg-destructive" : "bg-warning";
  expect(statusButton(name, label)).toHaveClass(activeClass);
};

const selectBatch = (batch: string) => {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: batch } });
};

/** Click Save, wait for the success dialog, and dismiss it. */
const saveAndDismissSummary = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText(/Attendance Saved/);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
};

// ── Tests ──────────────────────────────────────────────────────────────────
describe("AttendancePage batch switching", () => {
  it("preserves batch 1's unsaved marks when moving to batch 2 and saving batch 2", async () => {
    render(<AttendancePage />);
    expect(await screen.findByText("Aarav Gupta")).toBeInTheDocument();
    assertStatus("Aarav Gupta", "present");

    // Mark one student in batch 1 as absent
    selectBatch(m.BATCH_A);
    fireEvent.click(statusButton("Aarav Gupta", "A"));
    assertStatus("Aarav Gupta", "absent");

    // Move to batch 2 — batch 1 students are no longer listed
    selectBatch(m.BATCH_B);
    expect(screen.queryByText("Aarav Gupta")).not.toBeInTheDocument();

    // Mark one student in batch 2 and save (only batch 2 is saved)
    fireEvent.click(statusButton("Ishaan Verma", "A"));
    await saveAndDismissSummary();

    // Only batch 2 students were written to / deleted from the DB
    expect(m.insertedPayloads.flat().map((r) => r.student_id)).toEqual([
      "bbbbbbbb-0000-0000-0000-000000000001",
      "bbbbbbbb-0000-0000-0000-000000000002",
    ]);
    expect(m.deletedStudentIds.flat()).toEqual([
      "bbbbbbbb-0000-0000-0000-000000000001",
      "bbbbbbbb-0000-0000-0000-000000000002",
    ]);
    expect(m.attendanceRows.map((r) => r.student_id)).not.toContain("aaaaaaaa-0000-0000-0000-000000000001");

    // Wait for the post-save background refetch to run…
    await waitFor(() => expect(m.studentsQueryCount.value).toBeGreaterThanOrEqual(2), { timeout: 2000 });

    // …then go back to batch 1: the absent mark must survive the refetch.
    selectBatch(m.BATCH_A);
    assertStatus("Aarav Gupta", "absent");

    // Batch 2 statuses are now loaded back from the DB.
    selectBatch(m.BATCH_B);
    assertStatus("Ishaan Verma", "absent");
    assertStatus("Priya Nair", "present");
  });

  it("keeps batch 1's saved marks when batch 2 is saved afterwards", async () => {
    render(<AttendancePage />);
    await screen.findByText("Aarav Gupta");

    // Save batch 1 with one absent student
    selectBatch(m.BATCH_A);
    fireEvent.click(statusButton("Aarav Gupta", "A"));
    await saveAndDismissSummary();

    // Save batch 2 with one absent student
    selectBatch(m.BATCH_B);
    fireEvent.click(statusButton("Ishaan Verma", "A"));
    await saveAndDismissSummary();

    // Both batches persisted (3 + 2 rows)
    expect(m.attendanceRows.length).toBe(5);
    const statusByStudent = Object.fromEntries(m.attendanceRows.map((r) => [r.student_id, r.status]));
    expect(statusByStudent["aaaaaaaa-0000-0000-0000-000000000001"]).toBe("absent");
    expect(statusByStudent["bbbbbbbb-0000-0000-0000-000000000001"]).toBe("absent");

    // After the final background refetch, batch 1's marks reload from the DB
    await waitFor(() => expect(m.studentsQueryCount.value).toBeGreaterThanOrEqual(3), { timeout: 2000 });
    selectBatch(m.BATCH_A);
    assertStatus("Aarav Gupta", "absent");
    assertStatus("Ananya Sharma", "present");
  });

  it("shows the newest status when duplicate rows exist — stale duplicates don't reset batch 1 after batch 2 is saved", async () => {
    // Seed batch 1 with duplicate rows: an OLD "present" row (as written by
    // legacy insert-only saves) and a NEWER "absent" row (attendance page save).
    m.attendanceRows.push(
      { student_id: m.STUDENTS[0].id, status: "present", created_at: "2026-01-01T09:00:00Z" },
      { student_id: m.STUDENTS[0].id, status: "absent", created_at: "2026-01-01T10:00:00Z" },
      { student_id: m.STUDENTS[1].id, status: "present", created_at: "2026-01-01T09:00:00Z" },
      { student_id: m.STUDENTS[1].id, status: "present", created_at: "2026-01-01T10:00:00Z" },
    );

    render(<AttendancePage />);
    await screen.findByText("Aarav Gupta");
    // The NEWEST row must win — Aarav loads as absent, not the stale present.
    assertStatus("Aarav Gupta", "absent");

    // Now save batch 2 (triggers the post-save background refetch)
    selectBatch(m.BATCH_B);
    fireEvent.click(statusButton("Ishaan Verma", "A"));
    await saveAndDismissSummary();

    // After the refetch, batch 1 must still show its newest (absent) status
    await waitFor(() => expect(m.studentsQueryCount.value).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    selectBatch(m.BATCH_A);
    assertStatus("Aarav Gupta", "absent");
    assertStatus("Ananya Sharma", "present");
  });

  it("does not clobber unsaved marks when a realtime event triggers a refetch", async () => {
    render(<AttendancePage />);
    await screen.findByText("Aarav Gupta");

    selectBatch(m.BATCH_A);
    fireEvent.click(statusButton("Aarav Gupta", "A"));
    assertStatus("Aarav Gupta", "absent");

    // Simulate a realtime event (e.g. another device saving attendance)
    expect(m.attendanceCallbacks.length).toBeGreaterThan(0);
    act(() => { m.attendanceCallbacks[0](); });

    // Wait for the triggered refetch to complete — the unsaved mark must survive
    await waitFor(() => expect(m.studentsQueryCount.value).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    assertStatus("Aarav Gupta", "absent");
  });
});
