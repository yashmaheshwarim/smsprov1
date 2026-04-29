import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function StudentsScreen() {
  const { user } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStudents();
  }, [user]);

  const fetchStudents = async () => {
    if (!user) return;
    setLoading(true);
    
    // Fetch institute_id from users table for admin/teacher
    const { data: userData } = await supabase.from('users').select('institute_id').eq('id', user.id).single();
    
    if (userData?.institute_id) {
       const { data } = await supabase.from('students').select('*').eq('institute_id', userData.institute_id).order('name');
       if (data) {
         setStudents(data);
         setFiltered(data);
       }
    }
    setLoading(false);
  };

  const handleSearch = (text: string) => {
    setSearch(text);
    if (!text) setFiltered(students);
    else {
      setFiltered(students.filter(s => 
        s.name.toLowerCase().includes(text.toLowerCase()) || 
        s.enrollment_no?.toLowerCase().includes(text.toLowerCase())
      ));
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtext}>Batch: {item.batch_name || 'Unassigned'} • GRN: {item.enrollment_no}</Text>
      </View>
      <TouchableOpacity style={styles.actionBtn}>
        <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Students Directory</Text>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or GRN..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={handleSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={<Text style={{color: '#94a3b8', textAlign: 'center'}}>No students found.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 16 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 8, paddingHorizontal: 12, marginBottom: 16 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, color: '#f8fafc', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', padding: 12, borderRadius: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  info: { flex: 1 },
  name: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtext: { color: '#64748b', fontSize: 12 },
  actionBtn: { padding: 8 },
});
