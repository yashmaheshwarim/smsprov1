import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedEntry from '../../components/AnimatedEntry';

const initialTeachers = [
  { id: "T001", name: "Dr. Rajesh Sharma", email: "rajesh@institute.com", phone: "+91 9876543210", subjects: ["Physics", "Mathematics"], batches: 3, status: "active" },
  { id: "T002", name: "Prof. Anita Verma", email: "anita@institute.com", phone: "+91 9876543211", subjects: ["Chemistry"], batches: 2, status: "active" },
  { id: "T003", name: "Mr. Suresh Patel", email: "suresh@institute.com", phone: "+91 9876543212", subjects: ["Biology"], batches: 2, status: "active" },
  { id: "T004", name: "Ms. Kavita Nair", email: "kavita@institute.com", phone: "+91 9876543213", subjects: ["English", "Hindi"], batches: 4, status: "active" },
  { id: "T005", name: "Dr. Amit Kumar", email: "amit@institute.com", phone: "+91 9876543214", subjects: ["Mathematics"], batches: 3, status: "on_leave" },
  { id: "T006", name: "Prof. Meera Iyer", email: "meera@institute.com", phone: "+91 9876543215", subjects: ["Physics"], batches: 2, status: "active" },
];

export default function TeachersScreen() {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [filtered, setFiltered] = useState(initialTeachers);
  const [search, setSearch] = useState('');

  const handleSearch = (text: string) => {
    setSearch(text);
    if (!text) setFiltered(teachers);
    else {
      setFiltered(teachers.filter(t => 
        t.name?.toLowerCase().includes(text.toLowerCase()) || 
        t.email?.toLowerCase().includes(text.toLowerCase()) ||
        t.subjects.some(s => s.toLowerCase().includes(text.toLowerCase()))
      ));
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.name?.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.subtext}>{item.subjects.join(', ')} • {item.batches} batches</Text>
        <Text style={styles.detail}>{item.email}</Text>
        <Text style={styles.detail}>{item.phone}</Text>
      </View>
      <View style={[styles.status, item.status === 'active' ? styles.active : styles.inactive]}>
        <Text style={styles.statusText}>{item.status === 'active' ? 'Active' : 'On Leave'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <AnimatedEntry style={styles.wrapper} delay={140}>
      <View style={styles.container}>
        <Text style={styles.header}>Teachers Directory</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, or subject..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={handleSearch}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={t => t.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No teachers found.</Text>}
        />
        <TouchableOpacity style={styles.fab} onPress={() => alert('Add Teacher functionality coming soon!')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </AnimatedEntry>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, padding: 16 },
  header: { fontSize: 24, fontWeight: 'bold', color: '#1e293b', marginBottom: 16 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, paddingVertical: 14, color: '#1e293b', fontSize: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  info: { flex: 1 },
  name: { color: '#1e293b', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  subtext: { color: '#64748b', fontSize: 12, marginBottom: 2 },
  detail: { color: '#64748b', fontSize: 12 },
  status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  active: { backgroundColor: '#10b981' },
  inactive: { backgroundColor: '#f59e0b' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 50, fontSize: 16 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#3b82f6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});