import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function AttendanceScreen() {
  const { user, role } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, [user]);

  const fetchAttendance = async () => {
    if (!user) return;
    setLoading(true);
    
    if (role === 'admin' || role === 'teacher') {
      const { data: userData } = await supabase.from('users').select('institute_id').eq('id', user.id).single();
      if (userData?.institute_id) {
         const { data } = await supabase.from('attendance').select('*, students(name, enrollment_no)').eq('institute_id', userData.institute_id).order('date', { ascending: false }).limit(50);
         if (data) setRecords(data);
      }
    } else if (role === 'parent') {
      const childIds = user.childrenIds || [];
      if (childIds.length > 0) {
        const { data } = await supabase.from('attendance').select('*, students(name, enrollment_no)').in('student_id', childIds).order('date', { ascending: false }).limit(50);
        if (data) setRecords(data);
      }
    } else {
      // student fallback
      const { data } = await supabase.from('attendance').select('*, students(name, enrollment_no)').eq('student_id', user.id).order('date', { ascending: false }).limit(50);
      if (data) setRecords(data);
    }
    setLoading(false);
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.dateCol}>
        <Text style={styles.dateDay}>{new Date(item.date).getDate()}</Text>
        <Text style={styles.dateMonth}>{new Date(item.date).toLocaleString('default', { month: 'short' })}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.students?.name || 'Unknown Student'}</Text>
        <Text style={styles.subtext}>GRN: {item.students?.enrollment_no || 'N/A'}</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: item.status === 'present' ? '#10b981' : item.status === 'absent' ? '#ef4444' : '#f59e0b' }]}>
        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
      </View>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Text style={styles.header}>Attendance Log</Text>
        <TouchableOpacity onPress={fetchAttendance}>
           <Ionicons name="refresh" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={records}
        keyExtractor={s => s.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{color: '#94a3b8', textAlign: 'center'}}>No attendance records logged.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 16, borderRadius: 12, marginBottom: 8 },
  dateCol: { alignItems: 'center', marginRight: 16, backgroundColor: '#0f172a', padding: 8, borderRadius: 8, minWidth: 48 },
  dateDay: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  dateMonth: { color: '#3b82f6', fontSize: 10, textTransform: 'uppercase', fontWeight: 'bold' },
  info: { flex: 1 },
  name: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtext: { color: '#64748b', fontSize: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});
