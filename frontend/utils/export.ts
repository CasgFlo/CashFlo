import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import api from './api';

/**
 * Downloads all transactions as an Excel file (Pro).
 * The server gives a link valid for 10 minutes; the phone's browser downloads the file.
 */
export async function downloadExcelExport(): Promise<void> {
  const { data } = await api.post('/export/link');
  if (Platform.OS === 'web') {
    window.location.href = data.url;
    return;
  }
  await Linking.openURL(data.url);
}
