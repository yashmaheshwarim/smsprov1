import React, { createContext, useContext, useState } from 'react';

const MOCK_SUPER_ADMIN = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "superadmin@maheshwaritech.com",
  password: "super123",
  role: "superadmin" // matches mobile layout role logic
};

const MOCK_ADMIN = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@institute.com",
  password: "admin123",
  role: "admin",
  institute_id: "00000000-0000-0000-0000-000000000001"
};

const MOCK_TEACHER = {
  id: "00000000-0000-0000-0000-000000000010",
  email: "rajesh@institute.com",
  password: "teacher123",
  role: "teacher",
  institute_id: "00000000-0000-0000-0000-000000000001"
};

const MOCK_STUDENT = {
  id: "00000000-0000-0000-0000-000000000020",
  email: "aarav@student.com",
  password: "student123",
  role: "student",
  institute_id: "00000000-0000-0000-0000-000000000001"
};

const MOCK_PARENT = {
  id: "00000000-0000-0000-0000-000000000030",
  email: "parent@institute.com",
  password: "parent123",
  role: "parent",
  childrenIds: ["00000000-0000-0000-0000-000000000020"]
};

type AuthContextType = {
  session: any | null;
  user: any | null;
  role: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{error?: string}>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({ session: null, user: null, role: null, loading: false, login: async () => ({}), logout: () => {} });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const login = async (email: string, pass: string) => {
    if (email === MOCK_SUPER_ADMIN.email && pass === MOCK_SUPER_ADMIN.password) {
      setSession({ access_token: 'mock_token' });
      setUser(MOCK_SUPER_ADMIN);
      setRole("superadmin");
      return {};
    }
    if (email === MOCK_ADMIN.email && pass === MOCK_ADMIN.password) {
      setSession({ access_token: 'mock_token' });
      setUser(MOCK_ADMIN);
      setRole("admin");
      return {};
    }
    if (email === MOCK_TEACHER.email && pass === MOCK_TEACHER.password) {
      setSession({ access_token: 'mock_token' });
      setUser(MOCK_TEACHER);
      setRole("teacher");
      return {};
    }
    if (email === MOCK_STUDENT.email && pass === MOCK_STUDENT.password) {
      setSession({ access_token: 'mock_token' });
      setUser(MOCK_STUDENT);
      setRole("student");
      return {};
    }
    if (email === MOCK_PARENT.email && pass === MOCK_PARENT.password) {
      setSession({ access_token: 'mock_token' });
      setUser(MOCK_PARENT);
      setRole("parent");
      return {};
    }
    return { error: 'Invalid login credentials' };
  };

  const logout = () => {
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading: false, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
