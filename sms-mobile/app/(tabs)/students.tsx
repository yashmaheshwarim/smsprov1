import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AnimatedEntry from "../../components/AnimatedEntry";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type Student = {
  id: string;
  name?: string;
  enrollment_no?: string;
  grn?: string | number;
  batch_name?: string;
  email?: string;
  student_phone?: string;
  phone?: string;
  mother_phone?: string;
  father_phone?: string;
  status?: string;
  feeStatus?: string;
  joinDate?: string;
  enrollmentNo?: string;
  batch?: string;
};

export default function StudentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [filtered, setFiltered] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (user) {
      fetchStudents();
    }
  }, [user]);

  const fetchStudents = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Determine the Institute Context
      // Check if the current user is an 'employee' linked to an institute
      const { data: profileData, error: profileError } = await supabase
        .from("users")
        .select("institute_id")
        .eq("id", user.id)
        .maybeSingle();

      // If they have a linked institute_id, use it.
      // Otherwise, assume this user IS the Admin/Institute and use their own ID.
      const lookupId = profileData?.institute_id || user.id;

      console.log(`[Fetch] User: ${user.id} | Using Institute ID: ${lookupId}`);

      // 2. Fetch Students for that specific Institute
      const { data, error: studentError } = await supabase
        .from("students")
        .select("*")
        .eq("institute_id", lookupId)
        .order("name", { ascending: true });

      if (studentError) {
        throw studentError;
      }

      setStudents(data || []);
      setFiltered(data || []);
    } catch (err: any) {
      console.error("Fetch Error:", err.message);
      Alert.alert("Data Fetch Error", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStudents();
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    const q = text.trim().toLowerCase();

    if (!q) {
      setFiltered(students);
      return;
    }

    const result = students.filter((s) => {
      const name = s.name?.toLowerCase() || "";
      const enrollment = (s.enrollmentNo || s.enrollment_no || "")
        .toString()
        .toLowerCase();
      const grn = (s.grn || "").toString().toLowerCase();
      const batch = (s.batch || s.batch_name || "").toLowerCase();
      const email = (s.email || "").toLowerCase();

      return (
        name.includes(q) ||
        enrollment.includes(q) ||
        grn.includes(q) ||
        batch.includes(q) ||
        email.includes(q)
      );
    });

    setFiltered(result);
  };

  const showDetails = (item: Student) => {
    Alert.alert(
      item.name || "Student Details",
      [
        `Name: ${item.name || "N/A"}`,
        `Enrollment No: ${item.enrollmentNo || item.enrollment_no || "N/A"}`,
        `GRN: ${item.grn || "N/A"}`,
        `Batch: ${item.batch || item.batch_name || "N/A"}`,
        `Email: ${item.email || "N/A"}`,
        `Student Phone: ${item.student_phone || item.phone || "N/A"}`,
        `Mother Phone: ${item.mother_phone || item.phone || "N/A"}`,
        `Father Phone: ${item.father_phone || item.phone || "N/A"}`,
        `Status: ${item.status || "N/A"}`,
        `Fee Status: ${item.feeStatus || "N/A"}`,
      ].join("\n"),
      [{ text: "OK" }],
    );
  };

  const renderItem = ({ item }: { item: Student }) => {
    const avatar = item.name?.charAt(0).toUpperCase() || "S";

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => showDetails(item)}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatar}</Text>
        </View>

        <View style={styles.info}>
          <View style={styles.rowBetween}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name || "Unknown Student"}
            </Text>
            <View
              style={[
                styles.statusPill,
                item.status?.toLowerCase() === "active"
                  ? styles.statusActive
                  : styles.statusInactive,
              ]}
            >
              <Text style={styles.statusText}>{item.status || "N/A"}</Text>
            </View>
          </View>

          <Text style={styles.meta}>
            ID: {item.enrollmentNo || item.enrollment_no || "N/A"}
          </Text>
          <Text style={styles.meta}>
            Batch: {item.batch || item.batch_name || "N/A"}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      </TouchableOpacity>
    );
  };

  const headerCount = useMemo(() => filtered.length, [filtered]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading students...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.wrapper}>
      <AnimatedEntry style={styles.container} delay={140}>
        <View style={styles.headerBlock}>
          <Text style={styles.header}>Students Directory</Text>
          <Text style={styles.subHeader}>
            {headerCount} student{headerCount === 1 ? "" : "s"} found
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#64748b"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search students..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={handleSearch}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={54} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyText}>
                Check if you have added students to this institute ID.
              </Text>
            </View>
          }
        />
      </AnimatedEntry>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#475569" },
  headerBlock: { marginBottom: 14 },
  header: { fontSize: 26, fontWeight: "800", color: "#0f172a" },
  subHeader: { marginTop: 4, color: "#64748b", fontSize: 13 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    height: 50,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: "#1e293b" },
  listContent: { paddingBottom: 100 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  info: { flex: 1 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between" },
  name: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  meta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  statusActive: { backgroundColor: "#dcfce7" },
  statusInactive: { backgroundColor: "#fee2e2" },
  statusText: { fontSize: 10, fontWeight: "700" },
  emptyState: { alignItems: "center" },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: "700" },
  emptyText: { color: "#64748b", textAlign: "center", marginTop: 4 },
});
