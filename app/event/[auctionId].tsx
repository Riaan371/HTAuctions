// Step 2: add the lots for a live auction, in the order they will be sold.
import { View, Text, Pressable, ScrollView, TextInput, Image, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { C } from '../../components/LiveViewerParts';
import { formatZAR } from '../../components/LotCard';
import { confirmAsync, storagePathFromUrl, whenText } from '../../lib/admin-utils';

type Img = { uri: string; base64: string | null };
const MAX_PHOTOS = 8;

export default function EventScreen() {
  const { auctionId } = useLocalSearchParams<{ auctionId: string }>();
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  const { data: ev } = useQuery({
    queryKey: ['event', auctionId],
    queryFn: async () => {
      const { data } = await supabase.from('live_sessions').select('id, title, status, scheduled_at, lot_ids').eq('auction_id', auctionId).maybeSingle();
      return data;
    },
  });
  const lotIds: string[] = ev?.lot_ids ?? [];

  const { data: lots } = useQuery({
    queryKey: ['event-lots', auctionId, lotIds.join(',')],
    queryFn: async () => {
      if (!lotIds.length) return [];
      const { data } = await supabase.from('lots').select('id, title, description, photos, starting_bid, increment, reserve').in('id', lotIds);
      const rows = (data ?? []) as any[];
      rows.sort((a, b) => lotIds.indexOf(a.id) - lotIds.indexOf(b.id));
      return rows;
    },
    enabled: !!ev,
  });

  // ----- add / edit form state -----
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingBid, setStartingBid] = useState('');
  const [increment, setIncrement] = useState('1000');
  const [reserve, setReserve] = useState('');
  const [oldPhotos, setOldPhotos] = useState<string[]>([]);
  const [newImgs, setNewImgs] = useState<Img[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoCount = oldPhotos.length + newImgs.length;

  function resetForm() {
    setEditingId(null); setTitle(''); setDescription(''); setStartingBid(''); setIncrement('1000');
    setReserve(''); setOldPhotos([]); setNewImgs([]); setError(null);
  }
  function openNew() { resetForm(); setFormOpen(true); }
  function openEdit(l: any) {
    setEditingId(l.id); setTitle(l.title ?? ''); setDescription(l.description ?? '');
    setStartingBid(String(l.starting_bid ?? '')); setIncrement(String(l.increment ?? '1000'));
    setReserve(l.reserve ? String(l.reserve) : ''); setOldPhotos(l.photos ?? []); setNewImgs([]); setError(null);
    setFormOpen(true);
  }

  async function pickPhotos() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true,
      allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS,
    });
    if (!result.canceled) {
      setNewImgs((prev) => [...prev, ...result.assets.map((a) => ({ uri: a.uri, base64: a.base64 ?? null }))].slice(0, Math.max(0, MAX_PHOTOS - oldPhotos.length)));
    }
  }

  // Ctrl+V a screenshot or copied image while the form is open (web).
  useEffect(() => {
    if (!formOpen || Platform.OS !== 'web') return;
    const onPaste = (e: any) => {
      for (const item of e.clipboardData?.items ?? []) {
        if (item.type?.startsWith('image/')) {
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onload = (ev2) => {
            const dataUrl = ev2.target?.result as string;
            setNewImgs((prev) => (prev.length + oldPhotos.length < MAX_PHOTOS ? [...prev, { uri: dataUrl, base64: dataUrl.split(',')[1] }] : prev));
          };
          reader.readAsDataURL(file);
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [formOpen, oldPhotos.length]);

  async function currentLotIds(): Promise<string[]> {
    const { data } = await supabase.from('live_sessions').select('lot_ids').eq('auction_id', auctionId).maybeSingle();
    return (data?.lot_ids as string[] | null) ?? [];
  }
  async function saveOrder(ids: string[]) {
    const { error: e } = await supabase.from('live_sessions').update({ lot_ids: ids }).eq('auction_id', auctionId);
    if (e) throw new Error(e.message);
  }
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['event', auctionId] });
    queryClient.invalidateQueries({ queryKey: ['event-lots', auctionId] });
    queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    queryClient.invalidateQueries({ queryKey: ['live-all-lots'] });
  }

  async function saveLot() {
    setError(null);
    if (!session) { setError('Please log in again.'); return; }
    if (!title.trim()) { setError('Enter the lot name, for example "2018 Toyota Hilux".'); return; }
    const start = Number(startingBid);
    if (!start || start <= 0) { setError('Enter the opening bid in rand.'); return; }
    const inc = Number(increment);
    if (!inc || inc <= 0) { setError('Enter how much each bid goes up by.'); return; }

    setSaving(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < newImgs.length; i++) {
        const img = newImgs[i];
        if (!img.base64) continue;
        const path = `${session.user.id}/${Date.now()}-${i}.jpg`;
        const { error: upErr } = await supabase.storage.from('lot-photos').upload(path, decode(img.base64), { contentType: 'image/jpeg' });
        if (upErr) throw new Error('Photo upload failed: ' + upErr.message);
        urls.push(supabase.storage.from('lot-photos').getPublicUrl(path).data.publicUrl);
      }
      const photos = [...oldPhotos, ...urls];
      const fields = {
        title: title.trim(), description: description.trim() || null, photos,
        starting_bid: start, increment: inc, reserve: reserve ? Number(reserve) : null,
      };

      if (editingId) {
        const removed = ((lots ?? []).find((l: any) => l.id === editingId)?.photos ?? []).filter((p: string) => !oldPhotos.includes(p));
        const { error: uErr } = await supabase.from('lots').update(fields).eq('id', editingId);
        if (uErr) throw new Error(uErr.message);
        const paths = removed.map(storagePathFromUrl).filter(Boolean) as string[];
        if (paths.length) await supabase.storage.from('lot-photos').remove(paths);
      } else {
        const { data: lot, error: iErr } = await supabase.from('lots')
          .insert({ ...fields, category: 'Vehicles', auctioneer_id: session.user.id, auction_id: auctionId })
          .select('id').single();
        if (iErr || !lot) throw new Error(iErr?.message ?? 'Could not save the lot.');
        await saveOrder([...(await currentLotIds()), lot.id]);
      }
      refresh();
      resetForm(); setFormOpen(false);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  async function removeLot(l: any) {
    const ok = await confirmAsync('Delete this lot?', `"${l.title}" and its photos will be deleted. This cannot be undone.`);
    if (!ok) return;
    try {
      const paths = (l.photos ?? []).map(storagePathFromUrl).filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from('lot-photos').remove(paths);
      await supabase.from('bids').delete().eq('lot_id', l.id);
      const { error: dErr } = await supabase.from('lots').delete().eq('id', l.id);
      if (dErr) throw new Error(dErr.message);
      await saveOrder((await currentLotIds()).filter((id) => id !== l.id));
      refresh();
    } catch (e: any) { Alert.alert('Could not delete', e.message); }
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = [...lotIds];
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try { await saveOrder(ids); refresh(); } catch (e: any) { Alert.alert('Could not reorder', e.message); }
  }

  const ended = ev?.status === 'ended';

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <Stack.Screen options={{
        headerShown: true, title: 'Auction lots',
        headerStyle: { backgroundColor: C.ink }, headerTintColor: '#fff',
        headerLeft: () => (
          <Pressable onPress={() => router.replace('/(tabs)/profile')} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Profile</Text>
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.step}>STEP 2 OF 2</Text>
        <Text style={s.h1}>{ev?.title ?? 'Live auction'}</Text>
        <Text style={s.when}>{whenText(ev?.scheduled_at)}</Text>

        {ended && (
          <View style={s.note}>
            <Text style={s.noteTxt}>This auction has ended.</Text>
            <Pressable onPress={() => router.push(`/report/${auctionId}`)} style={[s.btn, s.btnDark, { marginTop: 10 }]}>
              <Text style={s.btnDarkTxt}>View the report</Text>
            </Pressable>
          </View>
        )}

        <Text style={s.section}>Lots in selling order ({lots?.length ?? 0})</Text>
        {(lots ?? []).length === 0 && !formOpen && (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No lots yet</Text>
            <Text style={s.emptySub}>Add each car or item that will be sold. Clients see the photos before the auction starts, and each lot's photos while it is on the block.</Text>
          </View>
        )}

        {(lots ?? []).map((l: any, i: number) => (
          <View key={l.id} style={s.lotRow}>
            <View style={s.lotNo}><Text style={s.lotNoTxt}>{i + 1}</Text></View>
            {l.photos?.[0]
              ? <Image source={{ uri: l.photos[0] }} style={s.lotImg} resizeMode="cover" />
              : <View style={[s.lotImg, { alignItems: 'center', justifyContent: 'center' }]}><Text>📷</Text></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.lotTitle} numberOfLines={2}>{l.title}</Text>
              <Text style={s.lotMeta}>Opening {formatZAR(l.starting_bid)} · steps of {formatZAR(l.increment)}</Text>
              <Text style={s.lotMeta}>{(l.photos?.length ?? 0)} photo{(l.photos?.length ?? 0) === 1 ? '' : 's'}</Text>
            </View>
            {!ended && (
              <View style={s.lotActions}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={[s.mini, i === 0 && { opacity: 0.3 }]}><Text style={s.miniTxt}>↑</Text></Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === (lots?.length ?? 0) - 1} style={[s.mini, i === (lots?.length ?? 0) - 1 && { opacity: 0.3 }]}><Text style={s.miniTxt}>↓</Text></Pressable>
                <Pressable onPress={() => openEdit(l)} style={s.mini}><Text style={s.miniTxt}>Edit</Text></Pressable>
                <Pressable onPress={() => removeLot(l)} style={[s.mini, { borderColor: '#F2B8B5' }]}><Text style={[s.miniTxt, { color: C.red }]}>Delete</Text></Pressable>
              </View>
            )}
          </View>
        ))}

        {!ended && !formOpen && (
          <Pressable onPress={openNew} style={s.addBtn}>
            <Text style={s.addBtnTxt}>+ Add a lot</Text>
          </Pressable>
        )}

        {formOpen && (
          <View style={s.form}>
            <Text style={s.formTitle}>{editingId ? 'Edit lot' : `Lot ${(lots?.length ?? 0) + 1}`}</Text>

            <Text style={s.label}>Photos</Text>
            <View style={s.photoRow}>
              {oldPhotos.map((p, i) => (
                <View key={p} style={s.photoBox}>
                  <Image source={{ uri: p }} style={s.photoImg} />
                  <Pressable onPress={() => setOldPhotos(oldPhotos.filter((_, k) => k !== i))} style={s.photoX}><Text style={s.photoXTxt}>✕</Text></Pressable>
                </View>
              ))}
              {newImgs.map((p, i) => (
                <View key={i} style={s.photoBox}>
                  <Image source={{ uri: p.uri }} style={s.photoImg} />
                  <Pressable onPress={() => setNewImgs(newImgs.filter((_, k) => k !== i))} style={s.photoX}><Text style={s.photoXTxt}>✕</Text></Pressable>
                </View>
              ))}
              {photoCount < MAX_PHOTOS && (
                <Pressable onPress={pickPhotos} style={[s.photoBox, s.photoAdd]}>
                  <Text style={{ fontSize: 30, color: C.sub }}>+</Text>
                  <Text style={{ fontSize: 12, color: C.sub }}>Add</Text>
                </Pressable>
              )}
            </View>
            <Text style={s.hint}>Up to {MAX_PHOTOS} photos. You can also paste a copied picture with Ctrl+V.</Text>

            <Text style={s.label}>Lot name (make and model)</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="2018 Toyota Hilux 2.8 GD-6" placeholderTextColor="#7C8F9A" style={s.input} />

            <Text style={s.label}>Description (optional)</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Condition, mileage, history…" placeholderTextColor="#7C8F9A"
              multiline numberOfLines={3} textAlignVertical="top" style={[s.input, { height: 92, paddingTop: 12 }]} />

            <View style={s.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Opening bid (R)</Text>
                <TextInput value={startingBid} onChangeText={setStartingBid} keyboardType="numeric" placeholder="15000" placeholderTextColor="#7C8F9A" style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Each bid goes up by (R)</Text>
                <TextInput value={increment} onChangeText={setIncrement} keyboardType="numeric" placeholder="1000" placeholderTextColor="#7C8F9A" style={s.input} />
              </View>
            </View>

            <Text style={s.label}>Reserve price (R, optional, private)</Text>
            <TextInput value={reserve} onChangeText={setReserve} keyboardType="numeric" placeholder="Lowest price you will accept" placeholderTextColor="#7C8F9A" style={s.input} />

            {error && <View style={s.error}><Text style={s.errorTxt}>{error}</Text></View>}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 18 }}>
              <Pressable onPress={saveLot} disabled={saving} style={[s.btn, s.btnOrange, { flex: 1 }, saving && { opacity: 0.6 }]}>
                {saving ? <ActivityIndicator color={C.ink} /> : <Text style={s.btnOrangeTxt}>{editingId ? 'Save changes' : 'Save lot'}</Text>}
              </Pressable>
              <Pressable onPress={() => { resetForm(); setFormOpen(false); }} style={[s.btn, s.btnLight]}>
                <Text style={s.btnLightTxt}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!ended && (
          <View style={s.finish}>
            <Text style={s.finishTitle}>When you are ready</Text>
            <Text style={s.finishSub}>
              On auction day, open the live room, choose your camera and microphone, and press Start Live Session. Clients see the auction go live at that moment.
            </Text>
            <Pressable onPress={() => router.push(`/live/${auctionId}`)} style={[s.btn, s.btnDark]}>
              <Text style={s.btnDarkTxt}>Go to the live room →</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 820, alignSelf: 'center' },
  step: { color: C.orangeDark, fontSize: 13, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  h1: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 4 },
  when: { color: C.sub, fontSize: 16, marginTop: 6, marginBottom: 20 },
  section: { color: C.ink, fontSize: 20, fontWeight: '800', marginBottom: 12, marginTop: 6 },
  note: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, marginBottom: 16 },
  noteTxt: { color: C.ink, fontSize: 16, fontWeight: '700' },
  empty: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 20, marginBottom: 14 },
  emptyTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
  emptySub: { color: C.sub, fontSize: 15, lineHeight: 22, marginTop: 6 },
  lotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, marginBottom: 10, flexWrap: 'wrap' },
  lotNo: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  lotNoTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  lotImg: { width: 76, height: 76, borderRadius: 12, backgroundColor: '#EEF3F2' },
  lotTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  lotMeta: { color: C.sub, fontSize: 14, marginTop: 2 },
  lotActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  mini: { borderWidth: 1.5, borderColor: C.line, borderRadius: 10, minWidth: 44, minHeight: 40, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  miniTxt: { color: C.ink, fontSize: 14, fontWeight: '700' },
  addBtn: { borderWidth: 2, borderStyle: 'dashed', borderColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', marginTop: 6, backgroundColor: '#FFF8F2' },
  addBtnTxt: { color: C.orangeDark, fontSize: 18, fontWeight: '900' },
  form: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20, marginTop: 8 },
  formTitle: { color: C.ink, fontSize: 22, fontWeight: '900', marginBottom: 14 },
  label: { color: C.ink, fontSize: 15.5, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  hint: { color: C.sub, fontSize: 13.5, marginTop: 8 },
  input: { minHeight: 54, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14, fontSize: 17, color: C.ink, backgroundColor: '#fff' },
  twoCol: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoBox: { width: 92, height: 92, borderRadius: 12, overflow: 'visible' },
  photoImg: { width: 92, height: 92, borderRadius: 12, backgroundColor: '#EEF3F2' },
  photoAdd: { borderWidth: 2, borderStyle: 'dashed', borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  photoX: { position: 'absolute', top: -8, right: -8, width: 26, height: 26, borderRadius: 13, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  photoXTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  error: { backgroundColor: C.redBg, borderRadius: 12, padding: 14, marginTop: 16 },
  errorTxt: { color: C.red, fontSize: 15.5, fontWeight: '600' },
  btn: { borderRadius: 14, minHeight: 54, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  btnOrange: { backgroundColor: C.orange },
  btnOrangeTxt: { color: C.ink, fontSize: 18, fontWeight: '900' },
  btnLight: { backgroundColor: '#E3EDEB' },
  btnLightTxt: { color: C.ink, fontSize: 16, fontWeight: '700' },
  btnDark: { backgroundColor: C.ink },
  btnDarkTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  finish: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20, marginTop: 28 },
  finishTitle: { color: C.ink, fontSize: 20, fontWeight: '800' },
  finishSub: { color: C.sub, fontSize: 15.5, lineHeight: 23, marginTop: 8, marginBottom: 16 },
});
