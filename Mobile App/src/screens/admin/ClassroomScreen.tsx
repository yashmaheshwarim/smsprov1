import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { supabase, isUuid } from '../../lib/supabase';
import { useAuth, AdminUser } from '../../contexts/AuthContext';
import {
  getGoogleClassroomConfig,
  saveGoogleClassroomConfig,
  disconnectGoogleClassroom,
  getGoogleOAuthUrl,
  parseTokenFromUrl,
  isOAuthRedirectUrl,
  listCourses,
  listAllCourseWorkMaterials,
  createCourseWorkMaterial,
  createGoogleCourse,
  listCourseStudents,
  addMultipleStudentsToCourse,
  type Course,
  type CourseWorkMaterial,
  type UploadMaterialRequest,
  type RedirectType,
} from '../../lib/google-classroom';

type MaterialTab = 'all' | 'videos' | 'documents' | 'links';

interface BatchForClassroom {
  id: string;
  name: string;
  studentCount: number;
}

export default function ClassroomScreen() {
  const { user } = useAuth();
  const adminUser = user as AdminUser;
  const instId = adminUser?.instituteId || '';

  // OAuth state
  const [clientId, setClientId] = useState('');
  const [redirectType, setRedirectType] = useState<RedirectType>('mobile');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthUrl, setOauthUrl] = useState('');

  // Courses
  const [courses, setCourses] = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  // Materials
  const [allMaterials, setAllMaterials] = useState<{ course: Course; materials: CourseWorkMaterial[] }[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialFilter, setMaterialFilter] = useState<MaterialTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Material preview
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState<'link' | 'drive' | 'youtube'>('link');

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    courseId: '',
    title: '',
    description: '',
    materialType: 'link' as 'driveFile' | 'link' | 'youTubeVideo',
    url: '',
    fileId: '',
  });
  const [uploading, setUploading] = useState(false);

  // Create course dialog
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [createCourseForm, setCreateCourseForm] = useState({ name: '', section: '', description: '' });
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseBatches, setCourseBatches] = useState<BatchForClassroom[]>([]);
  const [selectedCourseBatchId, setSelectedCourseBatchId] = useState('');

  // Roster / Enrollment
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [courseEnrollments, setCourseEnrollments] = useState<Record<string, any>>({});
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  // Batch sync dialog
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncCourseId, setSyncCourseId] = useState('');
  const [batches, setBatches] = useState<BatchForClassroom[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // ── Load saved config on mount ──

  useEffect(() => {
    if (!isUuid(instId)) return;
    (async () => {
      const config = await getGoogleClassroomConfig(instId);
      if (config?.connected && config.accessToken) {
        setAccessToken(config.accessToken);
        setClientId(config.clientId || '');
        setRedirectType(config.redirectType || 'mobile');
        setConnected(true);
        refreshAll(config.accessToken);
      }
    })();
  }, [instId]);

  // Load batches when create course modal opens
  useEffect(() => {
    if (createCourseOpen) {
      loadCourseBatches();
    }
  }, [createCourseOpen]);

  // ── Actions ──

  const refreshAll = async (token: string) => {
    await Promise.all([refreshCourses(token), refreshMaterials()]);
  };

  const refreshCourses = async (token: string) => {
    setCoursesLoading(true);
    try {
      const courseList = await listCourses(token);
      setCourses(courseList);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load courses');
    } finally {
      setCoursesLoading(false);
    }
  };

  const refreshMaterials = async () => {
    if (!accessToken) return;
    setMaterialsLoading(true);
    try {
      const data = await listAllCourseWorkMaterials(accessToken);
      setAllMaterials(data);
    } catch (err: any) {
      console.error('Failed to load materials:', err);
    } finally {
      setMaterialsLoading(false);
    }
  };

  const handleAuthenticate = () => {
    if (!clientId.trim()) {
      Alert.alert('Missing Client ID', 'Please enter your Google OAuth Client ID.');
      return;
    }
    const url = getGoogleOAuthUrl(clientId.trim(), redirectType);
    if (!url) {
      Alert.alert('Error', 'Invalid Client ID. Please check the format.');
      return;
    }
    setAuthenticating(true);
    setOauthUrl(url);
    setShowOAuthModal(true);
  };

  const handleOAuthNavigationChange = useCallback(
    async (navState: any) => {
      const { url } = navState;
      if (isOAuthRedirectUrl(url)) {
        const parsed = parseTokenFromUrl(url);
        if (parsed) {
          setAccessToken(parsed.accessToken);
          setConnected(true);
          setShowOAuthModal(false);
          setAuthenticating(false);

          if (isUuid(instId)) {
            await saveGoogleClassroomConfig(instId, {
              connected: true,
              clientId: clientId.trim(),
              accessToken: parsed.accessToken,
              tokenExpiry: Date.now() + parsed.expiresIn * 1000,
              redirectType,
            });
          }
          await refreshAll(parsed.accessToken);
          Alert.alert('✅ Connected', 'Google Classroom authenticated successfully.');
        }
      }
    },
    [instId, clientId]
  );

  const handleOAuthError = useCallback(() => {
    setShowOAuthModal(false);
    setAuthenticating(false);
    Alert.alert('Authentication Failed', 'Could not connect to Google Classroom. Please check your Client ID and try again.');
  }, []);

  const handleDisconnect = () => {
    Alert.alert('Disconnect Google Classroom', 'Are you sure? This will remove the integration.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setAccessToken(null);
          setConnected(false);
          setCourses([]);
          setAllMaterials([]);
          if (isUuid(instId)) {
            await disconnectGoogleClassroom(instId);
          }
          Alert.alert('Disconnected', 'Google Classroom integration removed.');
        },
      },
    ]);
  };

  const handleUpload = async () => {
    if (!uploadForm.courseId || !uploadForm.title) {
      Alert.alert('Missing Fields', 'Course and title are required.');
      return;
    }
    if (!accessToken) {
      Alert.alert('Not Connected', 'Please connect to Google Classroom first.');
      return;
    }
    setUploading(true);
    try {
      const materials = [];
      if (uploadForm.materialType === 'link' && uploadForm.url) {
        materials.push({ type: 'link' as const, url: uploadForm.url, title: uploadForm.title });
      } else if (uploadForm.materialType === 'youTubeVideo' && uploadForm.url) {
        materials.push({ type: 'youTubeVideo' as const, url: uploadForm.url, title: uploadForm.title });
      } else if (uploadForm.materialType === 'driveFile' && uploadForm.fileId) {
        materials.push({ type: 'driveFile' as const, fileId: uploadForm.fileId, title: uploadForm.title });
      }
      if (materials.length === 0) {
        Alert.alert('Missing Fields', 'Please provide the material URL or Drive file ID.');
        setUploading(false);
        return;
      }
      const request: UploadMaterialRequest = {
        courseId: uploadForm.courseId,
        title: uploadForm.title,
        description: uploadForm.description || undefined,
        materials,
      };
      await createCourseWorkMaterial(accessToken, request);
      Alert.alert('Material Uploaded', `"${uploadForm.title}" has been posted to Google Classroom.`);
      setUploadOpen(false);
      setUploadForm({ courseId: '', title: '', description: '', materialType: 'link', url: '', fileId: '' });
      refreshMaterials();
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Course Creation & Roster Management ──

  const loadCourseEnrollment = async (course: Course) => {
    if (!accessToken) return;
    setLoadingEnrollments(true);
    try {
      const students = await listCourseStudents(accessToken, course.id);
      setCourseEnrollments((prev) => ({
        ...prev,
        [course.id]: {
          courseId: course.id,
          courseName: course.name,
          students,
          enrollmentCode: course.enrollmentCode,
        },
      }));
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to load students');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const loadCourseBatches = async () => {
    if (!isUuid(instId)) return;
    const { data } = await supabase
      .from('batches')
      .select('id, name')
      .eq('institute_id', instId)
      .eq('status', 'active');

    if (data) {
      const batchesWithCounts = await Promise.all(
        data.map(async (b: any) => {
          const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('institute_id', instId)
            .eq('batch_id', b.id)
            .eq('status', 'active');
          return { id: b.id, name: b.name, studentCount: count || 0 };
        })
      );
      setCourseBatches(batchesWithCounts);
    }
  };

  const handleCreateCourse = async () => {
    if (!accessToken || !createCourseForm.name) {
      Alert.alert('Missing Fields', 'Course name is required.');
      return;
    }
    setCreatingCourse(true);
    try {
      const newCourse = await createGoogleCourse(accessToken, {
        name: createCourseForm.name,
        section: createCourseForm.section || undefined,
        description: createCourseForm.description || undefined,
      });

      // Save batch mapping if selected
      if (selectedCourseBatchId) {
        const selectedBatch = courseBatches.find((b) => b.id === selectedCourseBatchId);
        if (selectedBatch) {
          try {
            await supabase
              .from('classroom_mappings')
              .delete()
              .eq('institute_id', instId)
              .eq('batch_name', selectedBatch.name)
              .eq('course_name', createCourseForm.name);

            await supabase.from('classroom_mappings').insert([{
              institute_id: instId,
              batch_name: selectedBatch.name,
              course_name: createCourseForm.name,
              enrollment_code: newCourse.enrollmentCode || '',
              synced_at: new Date().toISOString(),
            }]);
          } catch (err) {
            console.warn('Could not save course-batch mapping:', err);
          }
        }
      }

      await refreshCourses(accessToken);
      setCreateCourseOpen(false);
      setSelectedCourseBatchId('');
      setCreateCourseForm({ name: '', section: '', description: '' });
      Alert.alert('Course Created', `"${createCourseForm.name}" has been created in Google Classroom.`);
    } catch (err: any) {
      Alert.alert('Failed', err.message || 'Could not create course.');
    } finally {
      setCreatingCourse(false);
    }
  };

  const openSyncDialog = async (course: Course) => {
    setSyncCourseId(course.id);
    setSelectedBatchIds([]);
    if (isUuid(instId)) {
      const { data } = await supabase
        .from('batches')
        .select('id, name')
        .eq('institute_id', instId)
        .eq('status', 'active');

      if (data) {
        const batchesWithCounts = await Promise.all(
          data.map(async (b: any) => {
            const { count } = await supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('institute_id', instId)
              .eq('batch_id', b.id)
              .eq('status', 'active');
            return { id: b.id, name: b.name, studentCount: count || 0 };
          })
        );
        setBatches(batchesWithCounts);
      }
    }
    setSyncOpen(true);
  };

  const saveBatchClassroomMapping = async (courseName: string, enrollmentCode: string | undefined) => {
    if (!isUuid(instId) || selectedBatchIds.length === 0) return;

    const { data: batchData } = await supabase
      .from('batches')
      .select('id, name')
      .in('id', selectedBatchIds);

    if (!batchData) return;

    const supabaseEntries = batchData.map((b: any) => ({
      institute_id: instId,
      batch_name: b.name,
      course_name: courseName,
      enrollment_code: enrollmentCode || '',
      synced_at: new Date().toISOString(),
    }));

    try {
      for (const entry of supabaseEntries) {
        await supabase
          .from('classroom_mappings')
          .delete()
          .eq('institute_id', entry.institute_id)
          .eq('batch_name', entry.batch_name)
          .eq('course_name', entry.course_name);
      }
      await supabase.from('classroom_mappings').insert(supabaseEntries);
    } catch (err) {
      console.warn('Failed to save classroom mappings:', err);
    }
  };

  const handleSyncBatch = async () => {
    if (!accessToken || !syncCourseId || selectedBatchIds.length === 0) {
      Alert.alert('Error', 'Please select at least one batch.');
      return;
    }
    setSyncing(true);
    try {
      const course = courses.find((c) => c.id === syncCourseId);
      const { data: students } = await supabase
        .from('students')
        .select('email, name')
        .eq('institute_id', instId)
        .in('batch_id', selectedBatchIds)
        .eq('status', 'active')
        .not('email', 'is', null);

      if (!students || students.length === 0) {
        Alert.alert('No Emails Found', 'Selected batches have no students with email addresses.');
        setSyncing(false);
        return;
      }

      const emails = students.map((s: any) => s.email).filter(Boolean);
      const result = await addMultipleStudentsToCourse(accessToken, syncCourseId, emails);

      if (course) {
        await saveBatchClassroomMapping(course.name, course.enrollmentCode);
      }
      if (course) await loadCourseEnrollment(course);

      setSyncOpen(false);

      if (result.failed.length > 0) {
        Alert.alert(
          'Sync Complete',
          `${result.success} student(s) invited. ${result.failed.length} failed.`
        );
      } else {
        Alert.alert('✅ Sync Complete', `${result.success} student(s) invited successfully.`);
      }
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message);
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived Data ──

  const filteredMaterials = useMemo(() => {
    return allMaterials
      .flatMap(({ course, materials }) =>
        materials
          .filter((m) => {
            if (materialFilter === 'videos') return m.materials?.some((mat: any) => mat.youTubeVideo);
            if (materialFilter === 'documents') return m.materials?.some((mat: any) => mat.driveFile);
            if (materialFilter === 'links') return m.materials?.some((mat: any) => mat.link);
            return true;
          })
          .filter((m) => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
              m.title.toLowerCase().includes(q) ||
              m.description?.toLowerCase().includes(q) ||
              course.name.toLowerCase().includes(q)
            );
          })
          .map((m) => ({ ...m, course }))
      );
  }, [allMaterials, materialFilter, searchQuery]);

  const getMaterialType = (material: CourseWorkMaterial): string => {
    if (material.materials?.some((m: any) => m.youTubeVideo)) return 'Video';
    if (material.materials?.some((m: any) => m.driveFile)) return 'Document';
    if (material.materials?.some((m: any) => m.link)) return 'Link';
    return 'Material';
  };

  const getMaterialIcon = (material: CourseWorkMaterial) => {
    if (material.materials?.some((m: any) => m.youTubeVideo)) return '🎬';
    if (material.materials?.some((m: any) => m.driveFile)) return '📄';
    if (material.materials?.some((m: any) => m.link)) return '🔗';
    return '📖';
  };

  // ── Material Preview ──

  const openMaterialPreview = (material: CourseWorkMaterial & { course?: Course }) => {
    if (!material.materials || material.materials.length === 0) {
      Alert.alert('No Content', 'This material has no content to preview.');
      return;
    }

    const firstMaterial = material.materials[0];

    if (firstMaterial.link) {
      setPreviewUrl(firstMaterial.link.url);
      setPreviewTitle(material.title);
      setPreviewType('link');
      setPreviewModalOpen(true);
    } else if (firstMaterial.driveFile) {
      // Preview-only Drive URL (no download, no export)
      const fileId = firstMaterial.driveFile.driveFile.id;
      setPreviewUrl(`https://drive.google.com/file/d/${fileId}/view?usp=sharing`);
      setPreviewTitle(material.title);
      setPreviewType('drive');
      setPreviewModalOpen(true);
    } else if (firstMaterial.youTubeVideo) {
      // YouTube video ID from Google Classroom API (returns 'id' as the raw video ID)
      const videoId = firstMaterial.youTubeVideo.id || '';
      if (!videoId) {
        Alert.alert('Invalid Video', 'This YouTube video has no valid ID.');
        return;
      }
      // Use embed URL for preview-only (no download, no related videos)
      setPreviewUrl(`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`);
      setPreviewTitle(material.title);
      setPreviewType('youtube');
      setPreviewModalOpen(true);
    } else {
      Alert.alert('Cannot Preview', 'This material type is not supported for preview.');
    }
  };

  const getMaterialColor = (material: CourseWorkMaterial) => {
    if (material.materials?.some((m: any) => m.youTubeVideo)) return '#ef4444';
    if (material.materials?.some((m: any) => m.driveFile)) return '#3b82f6';
    if (material.materials?.some((m: any) => m.link)) return '#22c55e';
    return '#6366f1';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Google Classroom</Text>
            <Text style={styles.headerSubtitle}>
              Connect your Google Account to manage coursework materials
            </Text>
          </View>
          {connected && (
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Connection Card */}
        <View style={[styles.card, connected ? styles.connectedCard : styles.disconnectedCard]}>
          <View style={[styles.cardAccent, { backgroundColor: connected ? '#22c55e' : '#9ca3af' }]} />

          {!connected ? (
            <View style={styles.cardBody}>
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIcon}>🎓</Text>
              </View>
              <Text style={styles.cardTitle}>Connect with Google</Text>
              <Text style={styles.cardDesc}>
                Sign in with your Google Workspace for Education account to access Google Classroom.
              </Text>

              <View style={styles.setupCard}>
                <Text style={styles.setupTitle}>How to set up</Text>

                <View style={styles.setupStep}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>Get a Google OAuth Client ID</Text>
                    <Text style={styles.stepDesc}>
                      Go to Google Cloud Console → Create a new OAuth 2.0 Client ID.{'\n'}
                      Choose{' '}
                      <Text style={{ fontWeight: '600', color: '#111827' }}>Desktop / Mobile App</Text>
                      {' '}type and add{' '}
                      <Text style={styles.codeHighlight}>apexsms://oauth-callback</Text> as redirect URI.{'\n'}
                      OR choose{' '}
                      <Text style={{ fontWeight: '600', color: '#111827' }}>Web Application</Text>
                      {' '}type and add{' '}
                      <Text style={styles.codeHighlight}>http://localhost</Text> as an authorized redirect URI.
                    </Text>
                  </View>
                </View>

                <View style={styles.setupStep}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>Enable Google Classroom API</Text>
                    <Text style={styles.stepDesc}>
                      In your Google Cloud project, go to APIs & Services → Library and enable "Google Classroom API".
                    </Text>
                  </View>
                </View>

                <View style={styles.setupStep}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>Select OAuth Client Type</Text>
                    <View style={styles.redirectTypeRow}>
                      <TouchableOpacity
                        style={[styles.redirectTypeBtn, redirectType === 'mobile' && styles.redirectTypeBtnActive]}
                        onPress={() => setRedirectType('mobile')}
                      >
                        <Text style={styles.redirectTypeIcon}>📱</Text>
                        <Text style={[styles.redirectTypeLabel, redirectType === 'mobile' && styles.redirectTypeLabelActive]}>
                          Mobile/Desktop App
                        </Text>
                        <Text style={styles.redirectTypeDesc}>
                          Redirect: apexsms://oauth-callback
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.redirectTypeBtn, redirectType === 'web' && styles.redirectTypeBtnActive]}
                        onPress={() => setRedirectType('web')}
                      >
                        <Text style={styles.redirectTypeIcon}>🌐</Text>
                        <Text style={[styles.redirectTypeLabel, redirectType === 'web' && styles.redirectTypeLabelActive]}>
                          Web Application
                        </Text>
                        <Text style={styles.redirectTypeDesc}>
                          Redirect: http://localhost
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.stepTitle}>Enter your Client ID</Text>
                    <TextInput
                      style={styles.clientIdInput}
                      placeholder="123456789-xxxxx.apps.googleusercontent.com"
                      placeholderTextColor="#9ca3af"
                      value={clientId}
                      onChangeText={setClientId}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      style={[styles.signInBtn, (!clientId.trim() || authenticating) && styles.signInBtnDisabled]}
                      onPress={handleAuthenticate}
                      disabled={!clientId.trim() || authenticating}
                    >
                      {authenticating ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text style={styles.signInBtnText}>  Opening Google...</Text>
                        </View>
                      ) : (
                        <Text style={styles.signInBtnText}>🎓 Sign in with Google</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            /* Connected State */
            <View style={styles.cardBody}>
              <View style={styles.connectedHeader}>
                <View style={[styles.cardIconWrap, { backgroundColor: '#dcfce7' }]}>
                  <Text style={styles.cardIcon}>✅</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.cardTitle}>Connected</Text>
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  </View>
                  <Text style={styles.cardDesc}>
                    Google Classroom is connected. You can view courses and manage materials below.
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => { refreshCourses(accessToken!); refreshMaterials(); }}
                  disabled={coursesLoading || materialsLoading}
                >
                  <Text style={styles.actionBtnText}>
                    {coursesLoading || materialsLoading ? '⟳ Refreshing...' : '⟳ Refresh'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={() => setUploadOpen(true)}>
                  <Text style={[styles.actionBtnText, { color: '#fff' }]}>+ Upload Material</Text>
                </TouchableOpacity>
              </View>

              {/* Courses Section */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Connected Courses ({courses.length})
                </Text>
                <TouchableOpacity
                  style={styles.createCourseBtn}
                  onPress={() => setCreateCourseOpen(true)}
                >
                  <Text style={styles.createCourseBtnText}>+ Create Course</Text>
                </TouchableOpacity>
              </View>

              {coursesLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#6366f1" />
                  <Text style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>Loading courses...</Text>
                </View>
              ) : courses.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#9ca3af' }}>No courses found.</Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                    Click "Create Course" to get started.
                  </Text>
                </View>
              ) : (
                courses.map((course) => (
                  <View key={course.id} style={styles.courseCard}>
                    {/* Course Header */}
                    <TouchableOpacity
                      style={styles.courseHeader}
                      onPress={() => {
                        if (expandedCourseId === course.id) {
                          setExpandedCourseId(null);
                        } else {
                          setExpandedCourseId(course.id);
                          loadCourseEnrollment(course);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.courseIcon}>
                        <Text style={styles.courseIconText}>📚</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.courseName} numberOfLines={1}>{course.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {course.section && (
                            <Text style={styles.courseSection}>{course.section}</Text>
                          )}
                          {course.enrollmentCode && (
                            <Text style={styles.courseCode}>Code: {course.enrollmentCode}</Text>
                          )}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TouchableOpacity
                          style={styles.courseActionBtn}
                          onPress={() => openSyncDialog(course)}
                        >
                          <Text style={styles.courseActionText}>👥</Text>
                        </TouchableOpacity>
                        <Text style={[styles.expandArrow, expandedCourseId === course.id && { transform: [{ rotate: '180deg' }] }]}>
                          ▼
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Expanded Enrollment */}
                    {expandedCourseId === course.id && (
                      <View style={styles.enrollmentSection}>
                        {loadingEnrollments ? (
                          <View style={{ padding: 16, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#6366f1" />
                            <Text style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>Loading students...</Text>
                          </View>
                        ) : (
                          <View style={{ padding: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                                👥 Enrolled Students
                              </Text>
                              {course.enrollmentCode && (
                                <TouchableOpacity
                                  onPress={() => {
                                    // Copy enrollment code
                                    Alert.alert('Enrollment Code', `Share this code: ${course.enrollmentCode}`);
                                  }}
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  <Text style={{ fontSize: 11, color: '#6366f1', fontWeight: '500' }}>
                                    Code: {course.enrollmentCode}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>

                            {courseEnrollments[course.id]?.students?.length === 0 ? (
                              <Text style={{ fontSize: 12, color: '#6b7280', paddingVertical: 8 }}>
                                No students enrolled yet. Sync from a batch to invite students.
                              </Text>
                            ) : (
                              (courseEnrollments[course.id]?.students || []).map((s: any, i: number) => (
                                <View key={i} style={styles.studentRow}>
                                  <Text style={styles.studentIcon}>📧</Text>
                                  <Text style={styles.studentName}>{s.name}</Text>
                                  <Text style={styles.studentEmail}>{s.emailAddress}</Text>
                                </View>
                              ))
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Materials Section */}
        {connected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Coursework Materials</Text>

            {/* Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {(['all', 'videos', 'documents', 'links'] as MaterialTab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.filterTab, materialFilter === tab && styles.filterTabActive]}
                  onPress={() => setMaterialFilter(tab)}
                >
                  <Text style={[styles.filterTabText, materialFilter === tab && styles.filterTabTextActive]}>
                    {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* Search */}
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search..."
                  placeholderTextColor="#9ca3af"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </ScrollView>

            {allMaterials.length === 0 && !materialsLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📖</Text>
                <Text style={styles.emptyTitle}>No materials found</Text>
                <Text style={styles.emptyDesc}>
                  Click "Refresh" to load materials, or "Upload Material" to add new content.
                </Text>
                <TouchableOpacity
                  style={[styles.actionBtn, { marginTop: 12 }]}
                  onPress={refreshMaterials}
                  disabled={materialsLoading}
                >
                  <Text style={styles.actionBtnText}>
                    {materialsLoading ? '⟳ Loading...' : '⟳ Load Materials'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {filteredMaterials.length === 0 && !materialsLoading && (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#9ca3af', fontSize: 13 }}>No materials match your filters</Text>
                  </View>
                )}
                <View style={{ gap: 8 }}>
                  {filteredMaterials.map((material) => (
                    <TouchableOpacity
                      key={material.id}
                      style={styles.materialCard}
                      activeOpacity={0.7}
                      onPress={() => openMaterialPreview(material as any)}
                    >
                      <View style={[styles.materialIcon, { backgroundColor: getMaterialColor(material) + '20' }]}>
                        <Text style={styles.materialIconEmoji}>{getMaterialIcon(material)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.materialTitle} numberOfLines={1}>{material.title}</Text>
                        <Text style={styles.materialCourse} numberOfLines={1}>
                          {(material as any).course?.name || material.courseId}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[styles.materialTypeBadge, { backgroundColor: getMaterialColor(material) + '20' }]}>
                            <Text style={[styles.materialTypeText, { color: getMaterialColor(material) }]}>
                              {getMaterialType(material)}
                            </Text>
                          </View>
                          <Text style={styles.materialDate}>
                            {new Date(material.creationTime).toLocaleDateString('en-IN')}
                          </Text>
                        </View>
                        {material.materials?.map((m: any, idx: number) => {
                          if (m.link) {
                            return (
                              <Text key={idx} style={styles.materialLink} numberOfLines={1}>
                                🔗 {m.link.title || m.link.url}
                              </Text>
                            );
                          }
                          if (m.driveFile) {
                            return (
                              <Text key={idx} style={styles.materialLink} numberOfLines={1}>
                                📄 {m.driveFile.driveFile.title}
                              </Text>
                            );
                          }
                          if (m.youTubeVideo) {
                            return (
                              <Text key={idx} style={styles.materialLink} numberOfLines={1}>
                                🎬 {m.youTubeVideo.title || 'Watch Video'}
                              </Text>
                            );
                          }
                          return null;
                        })}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {materialsLoading && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>
                  Loading materials from Google Classroom...
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── OAuth WebView Modal ── */}
      <Modal visible={showOAuthModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Google Sign-In</Text>
            <TouchableOpacity
              onPress={() => {
                setShowOAuthModal(false);
                setAuthenticating(false);
              }}
              style={{ padding: 8 }}
            >
              <Text style={{ fontSize: 16, color: '#6b7280' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: oauthUrl }}
            onNavigationStateChange={handleOAuthNavigationChange}
            onError={handleOAuthError}
            startInLoadingState
            renderLoading={() => (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={{ marginTop: 8, color: '#6b7280', fontSize: 13 }}>Loading Google Sign-In...</Text>
              </View>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Material Preview Modal ── */}
      <Modal visible={previewModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={styles.previewHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle} numberOfLines={1}>{previewTitle}</Text>
              <Text style={styles.previewType}>
                {previewType === 'drive' ? 'Google Drive — Preview Only' : 
                 previewType === 'youtube' ? 'YouTube — Watch' : 'Web Preview'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPreviewModalOpen(false)}
              style={styles.previewCloseBtn}
            >
              <Text style={styles.previewCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: previewUrl }}
            startInLoadingState
            javaScriptEnabled={previewType === 'youtube'}
            domStorageEnabled={true}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            mixedContentMode="never"
            style={{ flex: 1 }}
            renderLoading={() => (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={{ marginTop: 8, color: '#9ca3af', fontSize: 13 }}>Loading preview...</Text>
              </View>
            )}
          />
          <View style={styles.previewFooter}>
            <Text style={styles.previewFooterText}>🔒 Preview only — Download disabled</Text>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Upload Material Modal ── */}
      <Modal visible={uploadOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📤 Upload Material</Text>
              <TouchableOpacity onPress={() => setUploadOpen(false)}>
                <Text style={{ fontSize: 18, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Course *</Text>
            <View style={styles.pickerWrap}>
              {courses.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  style={[styles.pickerItem, uploadForm.courseId === course.id && styles.pickerItemActive]}
                  onPress={() => setUploadForm((p) => ({ ...p, courseId: course.id }))}
                >
                  <Text style={[styles.pickerItemText, uploadForm.courseId === course.id && styles.pickerItemTextActive]}>
                    {course.name}{course.section ? ` — ${course.section}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Thermodynamics Notes"
              placeholderTextColor="#9ca3af"
              value={uploadForm.title}
              onChangeText={(text) => setUploadForm((p) => ({ ...p, title: text }))}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Optional description..."
              placeholderTextColor="#9ca3af"
              value={uploadForm.description}
              onChangeText={(text) => setUploadForm((p) => ({ ...p, description: text }))}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.fieldLabel}>Material Type</Text>
            <View style={styles.typeRow}>
              {[
                { value: 'link' as const, label: 'Link', icon: '🔗' },
                { value: 'youTubeVideo' as const, label: 'YouTube', icon: '🎬' },
                { value: 'driveFile' as const, label: 'Drive', icon: '📄' },
              ].map(({ value, label, icon }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.typeBtn, uploadForm.materialType === value && styles.typeBtnActive]}
                  onPress={() => setUploadForm((p) => ({ ...p, materialType: value, url: '', fileId: '' }))}
                >
                  <Text style={styles.typeBtnIcon}>{icon}</Text>
                  <Text style={[styles.typeBtnLabel, uploadForm.materialType === value && styles.typeBtnLabelActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {uploadForm.materialType === 'link' && (
              <>
                <Text style={styles.fieldLabel}>URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://example.com/document"
                  placeholderTextColor="#9ca3af"
                  value={uploadForm.url}
                  onChangeText={(text) => setUploadForm((p) => ({ ...p, url: text }))}
                  autoCapitalize="none"
                />
              </>
            )}

            {uploadForm.materialType === 'youTubeVideo' && (
              <>
                <Text style={styles.fieldLabel}>YouTube URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://youtube.com/watch?v=..."
                  placeholderTextColor="#9ca3af"
                  value={uploadForm.url}
                  onChangeText={(text) => setUploadForm((p) => ({ ...p, url: text }))}
                  autoCapitalize="none"
                />
              </>
            )}

            {uploadForm.materialType === 'driveFile' && (
              <>
                <Text style={styles.fieldLabel}>Google Drive File ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1ABCDEfghIJKLMNOPqrstUVwxyz"
                  placeholderTextColor="#9ca3af"
                  value={uploadForm.fileId}
                  onChangeText={(text) => setUploadForm((p) => ({ ...p, fileId: text }))}
                  autoCapitalize="none"
                />
                <Text style={styles.fieldHint}>
                  The file ID is the part after /d/ in your Drive share link
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[styles.uploadBtn, (uploading || !uploadForm.courseId || !uploadForm.title) && styles.uploadBtnDisabled]}
              onPress={handleUpload}
              disabled={uploading || !uploadForm.courseId || !uploadForm.title}
            >
              {uploading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.uploadBtnText}>  Uploading to Classroom...</Text>
                </View>
              ) : (
                <Text style={styles.uploadBtnText}>📤 Post to Google Classroom</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Create Course Modal ── */}
      <Modal visible={createCourseOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📚 Create Course</Text>
              <TouchableOpacity onPress={() => setCreateCourseOpen(false)}>
                <Text style={{ fontSize: 18, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                This will create a new course in your connected Google Classroom account.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Map from Batch Management</Text>
            <TouchableOpacity style={styles.batchPickerBtn}>
              <Text style={styles.batchPickerText}>
                {selectedCourseBatchId
                  ? courseBatches.find((b) => b.id === selectedCourseBatchId)?.name || 'Select batch...'
                  : courseBatches.length > 0
                    ? 'Tap a batch below to auto-fill...'
                    : 'Loading batches...'}
              </Text>
            </TouchableOpacity>

            {courseBatches.length > 0 && (
              <View style={styles.batchList}>
                {courseBatches.map((batch) => (
                  <TouchableOpacity
                    key={batch.id}
                    style={[styles.batchItem, selectedCourseBatchId === batch.id && styles.batchItemActive]}
                    onPress={() => {
                      setSelectedCourseBatchId(batch.id);
                      setCreateCourseForm((p) => ({
                        ...p,
                        name: batch.name,
                        section: batch.name,
                      }));
                    }}
                  >
                    <Text style={[styles.batchItemText, selectedCourseBatchId === batch.id && styles.batchItemTextActive]}>
                      {batch.name} ({batch.studentCount} students)
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Course Name *</Text>
            <TextInput
              style={styles.input}
              value={createCourseForm.name}
              onChangeText={(text) => setCreateCourseForm((p) => ({ ...p, name: text }))}
              placeholder="e.g., JEE Advanced Physics 2026"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.fieldLabel}>Section</Text>
            <TextInput
              style={styles.input}
              value={createCourseForm.section}
              onChangeText={(text) => setCreateCourseForm((p) => ({ ...p, section: text }))}
              placeholder="e.g., Batch A"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={createCourseForm.description}
              onChangeText={(text) => setCreateCourseForm((p) => ({ ...p, description: text }))}
              placeholder="Course description..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.createBtn, (creatingCourse || !createCourseForm.name) && styles.uploadBtnDisabled]}
              onPress={handleCreateCourse}
              disabled={creatingCourse || !createCourseForm.name}
            >
              {creatingCourse ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.uploadBtnText}>  Creating Course...</Text>
                </View>
              ) : (
                <Text style={styles.uploadBtnText}>+ Create Course</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Sync Batch Students Modal ── */}
      <Modal visible={syncOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>👥 Sync Students</Text>
              <TouchableOpacity onPress={() => setSyncOpen(false)}>
                <Text style={{ fontSize: 18, color: '#6b7280' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Select batches to invite their students to this Google Classroom course.
                Students must have email addresses in their profiles.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Select Batches</Text>
            <View style={styles.batchSelectorBox}>
              {batches.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', paddingVertical: 16, fontSize: 13 }}>
                  No batches found
                </Text>
              ) : (
                batches.map((batch) => (
                  <TouchableOpacity
                    key={batch.id}
                    style={[styles.batchCheckItem, selectedBatchIds.includes(batch.id) && styles.batchCheckItemActive]}
                    onPress={() => {
                      setSelectedBatchIds((prev) =>
                        prev.includes(batch.id)
                          ? prev.filter((id) => id !== batch.id)
                          : [...prev, batch.id]
                      );
                    }}
                  >
                    <Text style={styles.checkbox}>{selectedBatchIds.includes(batch.id) ? '✅' : '⬜'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.batchCheckName}>{batch.name}</Text>
                      <Text style={styles.batchCheckCount}>{batch.studentCount} students</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <TouchableOpacity
              style={[styles.syncBtn, (syncing || selectedBatchIds.length === 0) && styles.uploadBtnDisabled]}
              onPress={handleSyncBatch}
              disabled={syncing || selectedBatchIds.length === 0}
            >
              {syncing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.uploadBtnText}>  Syncing Students...</Text>
                </View>
              ) : (
                <Text style={styles.uploadBtnText}>
                  👥 Invite {selectedBatchIds.reduce((sum, id) => {
                    const batch = batches.find((b) => b.id === id);
                    return sum + (batch?.studentCount || 0);
                  }, 0)} Students
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollView: { flex: 1, padding: 16 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 16 },
  disconnectBtn: {
    backgroundColor: '#fee2e2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  disconnectBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  connectedCard: {},
  disconnectedCard: {},
  cardAccent: { height: 4 },
  cardBody: { padding: 16 },
  cardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },

  // Setup instructions
  setupCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  setupTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  setupStep: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  stepNumberText: { fontSize: 11, fontWeight: '700', color: '#6366f1' },
  stepTitle: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
  stepDesc: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  codeHighlight: { fontSize: 11, color: '#6366f1', fontWeight: '500', backgroundColor: '#eef2ff', borderRadius: 2 },
  clientIdInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#111827',
    marginTop: 6,
    marginBottom: 10,
  },
  signInBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  signInBtnDisabled: { opacity: 0.6 },
  signInBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Redirect type selector
  redirectTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  redirectTypeBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  redirectTypeBtnActive: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  redirectTypeIcon: { fontSize: 20, marginBottom: 4 },
  redirectTypeLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', textAlign: 'center' },
  redirectTypeLabelActive: { color: '#6366f1' },
  redirectTypeDesc: { fontSize: 9, color: '#9ca3af', marginTop: 2, textAlign: 'center' },

  // Connected header
  connectedHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  activeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '600', color: '#16a34a' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  primaryBtn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  createCourseBtn: {
    backgroundColor: '#eef2ff',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  createCourseBtnText: { fontSize: 11, fontWeight: '600', color: '#6366f1' },

  // Course card
  courseCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  courseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  courseIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  courseIconText: { fontSize: 18 },
  courseName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  courseSection: { fontSize: 11, color: '#6b7280' },
  courseCode: { fontSize: 11, color: '#6366f1', fontWeight: '500' },
  courseActionBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  courseActionText: { fontSize: 14 },
  expandArrow: { fontSize: 10, color: '#6b7280', marginLeft: 4 },

  // Enrollment
  enrollmentSection: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    marginBottom: 4,
  },
  studentIcon: { fontSize: 12 },
  studentName: { fontSize: 12, fontWeight: '500', color: '#374151', flex: 1 },
  studentEmail: { fontSize: 11, color: '#6b7280' },

  // Filter row
  filterRow: { marginBottom: 12 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 6,
  },
  filterTabActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  filterTabText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  filterTabTextActive: { color: '#fff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    marginLeft: 6,
    minWidth: 120,
  },
  searchIcon: { fontSize: 12, marginRight: 4 },
  searchInput: { fontSize: 12, color: '#111827', paddingVertical: 6, flex: 1 },

  // Empty state
  emptyState: { alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 4 },
  emptyDesc: { fontSize: 12, color: '#6b7280', textAlign: 'center', lineHeight: 16 },

  // Material card
  materialCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  materialIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  materialIconEmoji: { fontSize: 16 },
  materialTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  materialCourse: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  materialTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  materialTypeText: { fontSize: 9, fontWeight: '600' },
  materialDate: { fontSize: 10, color: '#9ca3af' },
  materialLink: { fontSize: 11, color: '#6366f1', marginTop: 4 },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // Form fields
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
  },
  textArea: { minHeight: 64, textAlignVertical: 'top' },
  fieldHint: { fontSize: 10, color: '#6b7280', marginTop: 4 },

  // Picker
  pickerWrap: { gap: 4, maxHeight: 160 },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  pickerItemActive: { backgroundColor: '#eef2ff' },
  pickerItemText: { fontSize: 13, color: '#374151' },
  pickerItemTextActive: { color: '#6366f1', fontWeight: '600' },

  // Type selector
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeBtnActive: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  typeBtnIcon: { fontSize: 18, marginBottom: 4 },
  typeBtnLabel: { fontSize: 11, fontWeight: '500', color: '#6b7280' },
  typeBtnLabelActive: { color: '#6366f1', fontWeight: '600' },

  // Upload button
  uploadBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Create course
  infoBox: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  infoText: { fontSize: 12, color: '#6366f1', lineHeight: 16 },
  batchPickerBtn: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  batchPickerText: { fontSize: 13, color: '#6b7280' },
  batchList: { gap: 4, marginTop: 8, maxHeight: 160 },
  batchItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  batchItemActive: { backgroundColor: '#eef2ff' },
  batchItemText: { fontSize: 13, color: '#374151' },
  batchItemTextActive: { color: '#6366f1', fontWeight: '600' },
  createBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },

  // Batch sync
  batchSelectorBox: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 8,
    maxHeight: 240,
  },
  batchCheckItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  batchCheckItemActive: { backgroundColor: '#eef2ff' },
  checkbox: { fontSize: 14 },
  batchCheckName: { fontSize: 13, fontWeight: '500', color: '#374151' },
  batchCheckCount: { fontSize: 11, color: '#6b7280' },
  syncBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },

  // Preview modal
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111827',
  },
  previewTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  previewType: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  previewCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  previewCloseText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  previewFooter: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  previewFooterText: { fontSize: 11, color: '#6b7280' },
});
