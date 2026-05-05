import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DrawerMenu({ isOpen, onClose }: DrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, role } = useAuth();

  const menuItems = [
    { name: "Home", path: "/(tabs)", icon: "grid-outline", show: true },
    {
      name: "Institutes",
      path: "/(tabs)/institutes",
      icon: "business-outline",
      show: role === "superadmin",
    },
    {
      name: "Analytics",
      path: "/(tabs)/analytics",
      icon: "stats-chart-outline",
      show: role === "superadmin",
    },
    {
      name: "Students",
      path: "/(tabs)/students",
      icon: "people-outline",
      show: role === "admin" || role === "teacher",
    },
    {
      name: "Teachers",
      path: "/(tabs)/teachers",
      icon: "school-outline",
      show: role === "admin",
    },
    {
      name: "Attendance",
      path: "/(tabs)/attendance",
      icon: "calendar-outline",
      show: role && role !== "superadmin",
    },
    {
      name: "Attendance Report",
      path: "/(tabs)/attendanceReport",
      icon: "clipboard-outline",
      show: role && role !== "superadmin",
    },
    {
      name: "Fees",
      path: "/(tabs)/fees",
      icon: "cash-outline",
      show: role === "admin",
    },
  ];

  const visibleItems = menuItems.filter((item) => item.show);

  const handleNavigate = (path: string) => {
    router.push(path);
    onClose();
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  const isActive = (path: string) => pathname?.includes(path.split("/")[1]);

  return (
    <>
      {isOpen && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={onClose}
          activeOpacity={0.3}
        />
      )}
      <View
        style={[
          styles.drawer,
          isOpen ? styles.drawerOpen : styles.drawerClosed,
        ]}
      >
        <View style={styles.drawerHeader}>
          <Ionicons name="school" size={40} color="#3b82f6" />
          <Text style={styles.drawerTitle}>Apex SMS</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#1e293b" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.drawerContent}
          showsVerticalScrollIndicator={false}
        >
          {visibleItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.menuItem,
                isActive(item.path) && styles.menuItemActive,
              ]}
              onPress={() => handleNavigate(item.path)}
            >
              <Ionicons
                name={item.icon as any}
                size={20}
                color={isActive(item.path) ? "#3b82f6" : "#64748b"}
              />
              <Text
                style={[
                  styles.menuText,
                  isActive(item.path) && styles.menuTextActive,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.drawerFooter}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

export function DrawerHeader({ onMenuPress }: { onMenuPress: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onMenuPress} style={styles.hamburger}>
        <Ionicons name="menu" size={28} color="#1e293b" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Apex SMS</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 40,
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: "#ffffff",
    zIndex: 50,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 2, height: 0 },
    elevation: 8,
  },
  drawerOpen: {
    left: 0,
  },
  drawerClosed: {
    left: -280,
  },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginLeft: 12,
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  drawerContent: {
    flex: 1,
    paddingVertical: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: "#e0e7ff",
  },
  menuText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748b",
    marginLeft: 12,
  },
  menuTextActive: {
    color: "#3b82f6",
    fontWeight: "600",
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ef4444",
    marginLeft: 12,
  },
  header: {
    height: 56,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  hamburger: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
    marginLeft: 12,
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
});
