// screens/RankingScreen.tsx

import React from 'react';
import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Ranking'>;

export default function RankingScreen({ navigation }: Props) {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#ffffff" />
                </Pressable>
                <Text style={styles.title}>RANKING GLOBAL</Text>
            </View>

            <View style={styles.content}>
                <MaterialCommunityIcons name="podium" size={64} color="#ff3b30" />
                <Text style={styles.subtitle}>Classificação dos Atletas</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0f', paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 16 },
    backButton: { padding: 8, backgroundColor: '#131318', borderRadius: 12 },
    title: { color: '#ffffff', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    subtitle: { color: '#8a8a92', fontSize: 16, fontWeight: '600' },
});
