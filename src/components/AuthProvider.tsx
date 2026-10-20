'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@/types/auth';
import { getCurrentUser, signOutAction } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshSession: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshSession: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const current = await getCurrentUser();
      if (!current) {
        setUser(null);
        return null;
      }
      const mappedUser: User = {
        id: current.id,
        name: current.name || current.email.split('@')[0],
        email: current.email,
        role: (current.role as 'technician' | 'supervisor' | 'admin') || 'technician',
        organization: current.email.includes('@')
          ? current.email.split('@')[1].split('.')[0].toUpperCase() + ' Ops'
          : 'Field Ops',
        workspaceType: 'COMPANY',
        createdAt: new Date().toISOString(),
      };
      setUser(mappedUser);
      return mappedUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();

    // Supabase auth state change listener (browser-side token refreshes)
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        refreshSession();
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshSession]);

  const logout = async () => {
    try {
      await signOutAction();
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, refreshSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
