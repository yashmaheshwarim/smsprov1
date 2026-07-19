import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import { formatDate } from '../../lib/utils';

type EventType = 'event' | 'holiday' | 'exam' | 'parent_meeting';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: EventType;
  time?: string;
  location?: string;
  comments?: string;
}

const EVENT_TYPES: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: 'event', label: 'Event', icon: '🎉', color: '#6366f1' },
  { value: 'holiday', label: 'Holiday', icon: '🎉', color: '#ef4444' },
  { value: 'exam', label: 'Exam', icon: '📝', color: '#f59e0b' },
  { value: 'parent_meeting', label: 'Meeting', icon: '👥', color: '#22c55e' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState({ title: '', type: 'event' as EventType, date: '', time: '', location: '', comments: '' });

  useEffect(() => {
    if (isUuid(instId)) fetchEvents();
  }, [instId, currentMonth, currentYear]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('institute_id', instId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      setEvents(
        (data || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          type: e.type || 'event',
          time: e.time || '',
          location: e.location || '',
          comments: e.comments || '',
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const navigateMonth = (delta: number) => {
    let newMonth = currentMonth + delta;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const getEventsForDate = (dateStr: string) =>
    events.filter((e) => e.date === dateStr);

  const openAddModal = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingEvent(null);
    setForm({ title: '', type: 'event', date: dateStr, time: '', location: '', comments: '' });
    setShowModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEvent(event);
    setForm({
      title: event.title,
      type: event.type,
      date: event.date,
      time: event.time || '',
      location: event.location || '',
      comments: event.comments || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title) {
      Alert.alert('Error', 'Event title is required');
      return;
    }
    try {
      const payload = {
        institute_id: instId,
        title: form.title,
        type: form.type,
        date: form.date,
        time: form.time || null,
        location: form.location || null,
        comments: form.comments || null,
      };

      if (editingEvent) {
        await supabase.from('events').update(payload).eq('id', editingEvent.id);
      } else {
        await supabase.from('events').insert([payload]);
      }

      setShowModal(false);
      fetchEvents();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = async (eventId: string) => {
    Alert.alert('Delete Event', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('events').delete().eq('id', eventId);
          fetchEvents();
        },
      },
    ]);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const todayStr = new Date().toISOString().split('T')[0];
    const today = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) week.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      week.push(day);
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    return (
      <View>
        {/* Month Navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
            <Text style={styles.navBtnText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.navBtn}>
            <Text style={styles.navBtnText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* Day Headers */}
        <View style={styles.weekRow}>
          {DAYS.map((d) => (
            <View key={d} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              if (day === null) return <View key={`e-${di}`} style={styles.dayCell} />;
              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = getEventsForDate(dateStr);
              const isToday = dateStr === today;

              return (
                <TouchableOpacity
                  key={di}
                  style={[styles.dayCell, isToday && styles.todayCell]}
                  onPress={() => openAddModal(dateStr)}
                  onLongPress={() => {
                    if (dayEvents.length > 0) {
                      openEditModal(dayEvents[0]);
                    }
                  }}
                >
                  <Text style={[styles.dayText, isToday && styles.todayText]}>
                    {day}
                  </Text>
                  {dayEvents.length > 0 && (
                    <View style={styles.eventDots}>
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <View
                          key={i}
                          style={[
                            styles.eventDot,
                            {
                              backgroundColor:
                                EVENT_TYPES.find((t) => t.value === e.type)?.color || '#6366f1',
                            },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayEvents = getEventsForDate(todayDateStr);

  return (
    <ScrollView style={styles.container}>
      {/* Legend */}
      <View style={styles.legendRow}>
        {EVENT_TYPES.map((type) => (
          <View key={type.value} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: type.color }]} />
            <Text style={styles.legendText}>{type.label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={{ marginTop: 20 }} />
      ) : (
        renderCalendar()
      )}

      {/* Today's Events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 Today's Events</Text>
        {todayEvents.length === 0 ? (
          <Text style={styles.emptyText}>No events today. Tap a date to add one!</Text>
        ) : (
          todayEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => openEditModal(event)}
            >
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <TouchableOpacity onPress={() => handleDelete(event.id)}>
                  <Text style={styles.deleteText}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.eventMeta}>
                <StatusBadge
                  variant={
                    event.type === 'event'
                      ? 'primary'
                      : event.type === 'holiday'
                        ? 'danger'
                        : event.type === 'exam'
                          ? 'warning'
                          : 'success'
                  }
                >
                  {EVENT_TYPES.find((t) => t.value === event.type)?.label || event.type}
                </StatusBadge>
                {event.time ? <Text style={styles.eventTime}>🕐 {event.time}</Text> : null}
                {event.location ? <Text style={styles.eventLoc}>📍 {event.location}</Text> : null}
              </View>
              {event.comments ? (
                <Text style={styles.eventComments}>{event.comments}</Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* All Month Events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          📋 {MONTHS[currentMonth]} Events ({events.length})
        </Text>
        {events
          .filter((e) => e.date !== todayDateStr)
          .slice(0, 10)
          .map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => openEditModal(event)}
            >
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <TouchableOpacity onPress={() => handleDelete(event.id)}>
                  <Text style={styles.deleteText}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.eventDate}>{formatDate(event.date)}</Text>
              <View style={styles.eventMeta}>
                <StatusBadge
                  variant={
                    event.type === 'event'
                      ? 'primary'
                      : event.type === 'holiday'
                        ? 'danger'
                        : event.type === 'exam'
                          ? 'warning'
                          : 'success'
                  }
                >
                  {EVENT_TYPES.find((t) => t.value === event.type)?.label || event.type}
                </StatusBadge>
              </View>
            </TouchableOpacity>
          ))}
      </View>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingEvent ? 'Edit Event' : 'New Event'}
            </Text>
            <Text style={styles.modalDate}>📅 {selectedDate || form.date}</Text>

            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Event title"
              placeholderTextColor="#9ca3af"
              value={form.title}
              onChangeText={(t) => setForm({ ...form, title: t })}
            />

            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.typeRow}>
              {EVENT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeChip,
                    form.type === type.value && { backgroundColor: type.color, borderColor: type.color },
                  ]}
                  onPress={() => setForm({ ...form, type: type.value })}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      form.type === type.value && { color: '#fff' },
                    ]}
                  >
                    {type.icon} {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Time (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 10:00 AM"
              placeholderTextColor="#9ca3af"
              value={form.time}
              onChangeText={(t) => setForm({ ...form, time: t })}
            />

            <Text style={styles.inputLabel}>Location (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Room 101"
              placeholderTextColor="#9ca3af"
              value={form.location}
              onChangeText={(t) => setForm({ ...form, location: t })}
            />

            <Text style={styles.inputLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Additional details..."
              placeholderTextColor="#9ca3af"
              value={form.comments}
              onChangeText={(t) => setForm({ ...form, comments: t })}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>
                  {editingEvent ? '✏️ Update' : '➕ Add Event'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#6b7280' },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
  },
  navBtn: { padding: 8 },
  navBtnText: { fontSize: 16, color: '#6366f1' },
  monthTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  dayHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dayHeaderText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    margin: 1,
    borderRadius: 8,
    padding: 2,
  },
  todayCell: { backgroundColor: '#eef2ff', borderWidth: 2, borderColor: '#6366f1' },
  dayText: { fontSize: 13, fontWeight: '500', color: '#374151' },
  todayText: { color: '#6366f1', fontWeight: '700' },
  eventDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  eventDot: { width: 5, height: 5, borderRadius: 2.5 },
  section: { marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  eventDate: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  eventTime: { fontSize: 12, color: '#6b7280' },
  eventLoc: { fontSize: 12, color: '#6b7280' },
  eventComments: { fontSize: 12, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' },
  deleteText: { fontSize: 16 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modalDate: { fontSize: 13, color: '#6366f1', fontWeight: '600', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeChipText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  modalActions: { marginTop: 20, gap: 8 },
  saveBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { color: '#6b7280', fontWeight: '500' },
});
