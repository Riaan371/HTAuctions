// Admin: approve or reject new bidders. Nobody can bid until approved here.
import { View, Text, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { C } from './LiveViewerParts';

type Row = { id: string; full_name: string | null; phone: string | null; email: string | null; created_at: string | null; kyc_status: string };
type Filter = 'pending' | 'approved' | 'rejected';
const LABEL: Record<Filter, string> = { approved: 'Can bid', rejected: 'Blocked', pending: 'Not active yet' };

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('0')) return '27' + d.slice(1);
  return d;
}

export default function AdminApprovals() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('approved');
  const [open, setOpen] = useState(false);

  const { data: pendingCount } = useQuery({
    queryKey: ['bidder-pending-count'],
    queryFn: async () => {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'bidder').eq('kyc_status', 'pending');
      return count ?? 0;
    },
    refetchInterval: 20000,
  });

  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['bidder-approvals', filter],
    queryFn: async () => {
      const { data, error: e } = await supabase.from('users')
        .select('id, full_name, phone, email, created_at, kyc_status')
        .eq('role', 'bidder').eq('kyc_status', filter)
        .order('created_at', { ascending: false }).limit(100);
      if (e) throw new Error(e.message);
      return (data ?? []) as Row[];
    },
    enabled: open,
  });

  async function setStatus(r: Row, status: Filter) {
    const { error: e } = await supabase.rpc('set_bidder_status', { p_user: r.id, p_status: status });
    if (e) {
      Alert.alert('Could not update', /function|does not exist|schema cache/i.test(e.message)
        ? 'The database function is not installed yet. Run the security SQL script first.'
        : e.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['bidder-approvals'] });
    queryClient.invalidateQueries({ queryKey: ['bidder-pending-count'] });
  }

  return (
    <View style={s.card}>
      <Pressable onPress={() => setOpen(!open)} style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Bidders</Text>
          <Text style={s.sub}>Anyone who confirms their email can bid. Block a bidder here if they do not pay.</Text>
        </View>
        
        <Text style={s.chev}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <View style={{ marginTop: 14 }}>
          <View style={s.chips}>
            {(Object.keys(LABEL) as Filter[]).map((f) => (
              <Pressable key={f} onPress={() => setFilter(f)} style={[s.chip, filter === f && s.chipOn]}>
                <Text style={[s.chipTxt, filter === f && { fontWeight: '800' }]}>{LABEL[f]}</Text>
              </Pressable>
            ))}
          </View>

          {isLoading && <Text style={s.sub}>Loading…</Text>}
          {error && <Text style={[s.sub, { color: C.red }]}>Could not load bidders: {(error as Error).message}</Text>}
          {!isLoading && !error && (rows ?? []).length === 0 && <Text style={s.sub}>No {LABEL[filter].toLowerCase()} bidders.</Text>}

          {(rows ?? []).map((r) => {
            const wa = waNumber(r.phone);
            return (
              <View key={r.id} style={s.row}>
                <Text style={s.name}>{r.full_name ?? 'No name'}</Text>
                <Text style={s.line}>Cell: {r.phone ?? 'not given'}</Text>
                <Text style={s.line}>Email: {r.email ?? 'not given'}</Text>
                {r.created_at && <Text style={s.line}>Registered {new Date(r.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>}
                <View style={s.btnRow}>
                  {r.phone && <Pressable onPress={() => Linking.openURL(`tel:${r.phone}`)} style={s.ghost}><Text style={s.ghostTxt}>Call</Text></Pressable>}
                  {wa && <Pressable onPress={() => Linking.openURL(`https://wa.me/${wa}`)} style={s.ghost}><Text style={s.ghostTxt}>WhatsApp</Text></Pressable>}
                  {filter !== 'approved' && <Pressable onPress={() => setStatus(r, 'approved')} style={s.approve}><Text style={s.approveTxt}>{filter === 'rejected' ? 'Allow again' : 'Allow to bid'}</Text></Pressable>}
                  {filter !== 'rejected' && <Pressable onPress={() => setStatus(r, 'rejected')} style={s.reject}><Text style={s.rejectTxt}>Block</Text></Pressable>}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 18, marginBottom: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: C.ink, fontSize: 20, fontWeight: '800' },
  sub: { color: C.sub, fontSize: 14.5, lineHeight: 21, marginTop: 2 },
  badge: { backgroundColor: C.orange, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  badgeTxt: { color: C.ink, fontSize: 13, fontWeight: '900' },
  chev: { color: C.sub, fontSize: 14 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  chip: { borderWidth: 1.5, borderColor: C.line, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.orange, borderColor: C.orange },
  chipTxt: { color: C.ink, fontSize: 14.5, fontWeight: '600' },
  row: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, marginTop: 14 },
  name: { color: C.ink, fontSize: 18, fontWeight: '800' },
  line: { color: C.sub, fontSize: 15, marginTop: 2 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ghost: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  ghostTxt: { color: C.ink, fontSize: 14.5, fontWeight: '800' },
  approve: { backgroundColor: C.green, borderRadius: 12, minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  approveTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  reject: { borderWidth: 1.5, borderColor: '#F2B8B5', borderRadius: 12, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rejectTxt: { color: C.red, fontSize: 14.5, fontWeight: '800' },
});
