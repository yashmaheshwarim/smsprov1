import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { Ionicons } from "@expo/vector-icons";

export default function AttendanceReport() {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchClassList();
  }, []);

  const fetchClassList = async () => {
    setLoading(true);
    // 1. Get Teacher's Institute
    const { data: userData } = await supabase.from("users").select("institute_id").eq("id", user?.id).single();
    
    if (userData?.institute_id) {
      // 2. Fetch all students in that institute
      const { data: studentList } = await supabase
        .from("students")
        .select("id, name, enrollment_no")
        .eq("institute_id", userData.institute_id);

      // 3. Fetch existing attendance for today to prevent duplicates/show current state
      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("date", today);

      const formattedData = studentList?.map(s => ({
        ...s,
        status: existingAttendance?.find(a => a.student_id === s.id)?.status || "present"
      }));

      setStudents(formattedData || []);
    }
    setLoading(false);
  };

  const toggleStatus = (id: string) => {
    setStudents(prev => prev.map(s => {
      if (s.id === id) {
        const nextStatus = s.status === "present" ? "absent" : s.status === "absent" ? "late" : "present";
        return { ...s, status: nextStatus };
      }
      return s;
    }));
  };

  const saveAttendance = async () => {
    setSaving(true);
    const { data: userData } = await supabase.from("users").select("institute_id").eq("id", user?.id).single();

    const updates = students.map(s => ({
      student_id: s.id,
      institute_id: userData?.institute_id,
      date: today,
      status: s.status,
    }));

    const { error } = await supabase.from("attendance").upsert(updates, { onConflict: 'student_id, date' });

    setSaving(false);
    if (error) Alert.alert("Error", error.message);
    else Alert.alert("Success", "Attendance updated for today");
  };

  const renderStudent = ({ item }: { item: any }) => (
    <View style={styles.studentCard}>
      <View>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentRoll}>ID: {item.enrollment_no}</Text>
      </View>
      <TouchableOpacity 
        onPress={() => toggleStatus(item.id)}
        style={[styles.statusToggle, { backgroundColor: item.status === 'present' ? '#10b981' : item.status === 'absent' ? '#ef4444' : '#f59e0b' }]}
      >
        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mark Attendance</Text>
        <Text style={styles.date}>{today}</Text>
      </View>

      {loading ? <ActivityIndicator size="large" style={{ marginTop: 20 }} /> : (
        <>
          <FlatList data={students} renderItem={renderStudent} keyExtractor={item => item.id} />
          <TouchableOpacity style={styles.saveBtn} onPress={saveAttendance} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Submit Records</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1e293b' },
  date: { color: '#64748b', fontSize: 14 },
  studentCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 2 },
  studentName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  studentRoll: { fontSize: 12, color: '#64748b' },
  statusToggle: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  statusText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#3b82f6', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});