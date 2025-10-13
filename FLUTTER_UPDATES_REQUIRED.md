# 📱 Flutter App Updates Required

## Overview

Your backend is now MongoDB-ready with support for all three features. Here's what needs to be updated in the Flutter app.

---

## ✅ Priority 1: Add Missing Packages

### Update `pubspec.yaml`

Add these dependencies:

```yaml
dependencies:
  # Existing packages...
  
  # NEW - For Device ID Locking
  flutter_secure_storage: ^9.2.2  # Secure device ID storage
  uuid: ^4.5.1                     # Generate unique device IDs
  device_info_plus: ^10.1.2        # Device fingerprinting (optional)
```

Then run:
```bash
flutter pub get
```

---

## ✅ Priority 2: Device ID Service

### Create `lib/core/services/device_id_service.dart`

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'logger_service.dart';

class DeviceIdService {
  static final DeviceIdService _instance = DeviceIdService._internal();
  factory DeviceIdService() => _instance;
  DeviceIdService._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final LoggerService _logger = LoggerService();
  final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();
  
  static const String _deviceIdKey = 'unique_device_id';
  String? _cachedDeviceId;

  /// Get or generate device ID (persistent across app reinstalls)
  Future<String> getDeviceId() async {
    // Return cached if available
    if (_cachedDeviceId != null) {
      return _cachedDeviceId!;
    }

    try {
      // Try to get existing device ID
      String? deviceId = await _storage.read(key: _deviceIdKey);

      if (deviceId == null || deviceId.isEmpty) {
        // Generate new UUID
        deviceId = const Uuid().v4();
        
        // Save securely
        await _storage.write(key: _deviceIdKey, value: deviceId);
        
        _logger.info('🆔 Generated new device ID: ${deviceId.substring(0, 8)}...');
      } else {
        _logger.debug('🆔 Retrieved existing device ID: ${deviceId.substring(0, 8)}...');
      }

      _cachedDeviceId = deviceId;
      return deviceId;

    } catch (e, stackTrace) {
      _logger.error('Failed to get/generate device ID', e, stackTrace);
      
      // Fallback: generate UUID but don't save (will be different next time)
      final fallbackId = const Uuid().v4();
      _logger.warning('Using fallback device ID (not persisted)');
      return fallbackId;
    }
  }

  /// Get device info for logging/debugging (optional)
  Future<Map<String, dynamic>> getDeviceInfo() async {
    try {
      if (Platform.isAndroid) {
        final androidInfo = await _deviceInfo.androidInfo;
        return {
          'model': androidInfo.model,
          'manufacturer': androidInfo.manufacturer,
          'androidVersion': androidInfo.version.release,
          'sdk': androidInfo.version.sdkInt,
        };
      } else if (Platform.isIOS) {
        final iosInfo = await _deviceInfo.iosInfo;
        return {
          'model': iosInfo.model,
          'systemVersion': iosInfo.systemVersion,
          'name': iosInfo.name,
        };
      }
    } catch (e) {
      _logger.warning('Could not fetch device info: $e');
    }
    return {};
  }

  /// Clear device ID (for testing or account reset)
  Future<void> clearDeviceId() async {
    await _storage.delete(key: _deviceIdKey);
    _cachedDeviceId = null;
    _logger.info('🗑️ Device ID cleared');
  }
}
```

Don't forget to add import:
```dart
import 'dart:io';
```

---

## ✅ Priority 3: Update HTTP Service

### Modify `lib/core/services/http_service.dart`

Add device ID to all check-in requests:

```dart
import '../constants/api_constants.dart';
import 'device_id_service.dart';  // ADD THIS
import 'logger_service.dart';

class HttpService {
  static final HttpService _instance = HttpService._internal();
  factory HttpService() => _instance;
  HttpService._internal();

  final DeviceIdService _deviceIdService = DeviceIdService();  // ADD THIS
  final LoggerService _logger = LoggerService();

  // ... existing code ...

  Future<http.Response> submitAttendance({
    required String studentId,
    required String classId,
    required int rssi,
    double? distance,
  }) async {
    try {
      // GET DEVICE ID
      final deviceId = await _deviceIdService.getDeviceId();
      
      final body = {
        'studentId': studentId,
        'classId': classId,
        'deviceId': deviceId,  // ADD THIS
        'rssi': rssi,           // ADD THIS
        'distance': distance,    // ADD THIS (optional)
      };

      _logger.debug('Submitting attendance: $body');

      return await post(
        url: ApiConstants.checkInUrl,
        body: body,
      );
    } catch (e, stackTrace) {
      _logger.error('Failed to submit attendance', e, stackTrace);
      rethrow;
    }
  }

  // NEW METHOD: Confirm attendance
  Future<http.Response> confirmAttendance({
    required String studentId,
    required String classId,
  }) async {
    try {
      final body = {
        'studentId': studentId,
        'classId': classId,
      };

      return await post(
        url: '${ApiConstants.baseUrl}/api/attendance/confirm',
        body: body,
      );
    } catch (e, stackTrace) {
      _logger.error('Failed to confirm attendance', e, stackTrace);
      rethrow;
    }
  }

  // NEW METHOD: Stream RSSI data
  Future<http.Response> streamRSSIData({
    required String studentId,
    required String classId,
    required List<Map<String, dynamic>> rssiData,
  }) async {
    try {
      final body = {
        'studentId': studentId,
        'classId': classId,
        'rssiData': rssiData,
      };

      return await post(
        url: '${ApiConstants.baseUrl}/api/check-in/stream',
        body: body,
      );
    } catch (e, stackTrace) {
      _logger.error('Failed to stream RSSI data', e, stackTrace);
      rethrow;
    }
  }
}
```

---

## ✅ Priority 4: Handle Device Mismatch

### Update Attendance Logic

Wherever you handle the check-in response, add error handling:

```dart
try {
  final response = await httpService.submitAttendance(
    studentId: studentId,
    classId: classId,
    rssi: beacon.rssi,
    distance: distance,
  );

  if (response.statusCode == 403) {
    // Device mismatch!
    final error = jsonDecode(response.body);
    
    _alertService.showError(
      'Device Mismatch',
      'This account is linked to a different device. Contact admin.',
    );
    
    _logger.error('Device mismatch for student: $studentId');
    return false;
  }

  if (response.statusCode == 201 || response.statusCode == 200) {
    final data = jsonDecode(response.body);
    final status = data['status']; // 'provisional' or 'confirmed'
    
    _logger.info('Attendance marked: $status');
    return true;
  }

} catch (e) {
  _logger.error('Check-in failed', e);
  return false;
}
```

---

## ✅ Priority 5: Update App Constants

### Modify `lib/core/constants/app_constants.dart`

Add these new constants:

```dart
class AppConstants {
  // Existing constants...
  
  // Device ID Configuration
  static const String deviceIdKey = 'unique_device_id';
  
  // RSSI Streaming Configuration (for co-location)
  static const Duration rssiStreamDuration = Duration(minutes: 15);
  static const Duration rssiCaptureInterval = Duration(seconds: 5);
  static const int rssiMaxBatchSize = 50; // Send in batches
  
  // Two-Step Attendance Timing
  static const Duration secondCheckDelay = Duration(minutes: 10);
  static const Duration confirmationTimeout = Duration(minutes: 20);
}
```

---

## ✅ Priority 6: Implement Two-Step Confirmation

### Add to `beacon_service.dart` or create `attendance_confirmation_service.dart`

```dart
import 'dart:async';
import '../constants/app_constants.dart';
import 'http_service.dart';
import 'logger_service.dart';
import 'storage_service.dart';

class AttendanceConfirmationService {
  static final AttendanceConfirmationService _instance = 
      AttendanceConfirmationService._internal();
  factory AttendanceConfirmationService() => _instance;
  AttendanceConfirmationService._internal();

  final HttpService _httpService = HttpService();
  final LoggerService _logger = LoggerService();
  final StorageService _storageService = StorageService();
  
  Timer? _confirmationTimer;

  /// Schedule confirmation after check-in
  void scheduleConfirmation(String studentId, String classId) {
    // Cancel existing timer
    _confirmationTimer?.cancel();

    _logger.info('⏰ Confirmation scheduled in ${AppConstants.secondCheckDelay.inMinutes} minutes');

    // Schedule confirmation
    _confirmationTimer = Timer(AppConstants.secondCheckDelay, () {
      _confirmAttendance(studentId, classId);
    });
  }

  Future<void> _confirmAttendance(String studentId, String classId) async {
    try {
      _logger.info('✅ Attempting to confirm attendance...');

      final response = await _httpService.confirmAttendance(
        studentId: studentId,
        classId: classId,
      );

      if (response.statusCode == 200) {
        _logger.info('✅ Attendance confirmed successfully!');
        
        // Optional: Show notification
        // await SimpleNotificationService.showNotification(
        //   'Attendance Confirmed',
        //   'Your attendance for $classId has been confirmed',
        // );
      } else if (response.statusCode == 404) {
        _logger.warning('⚠️ No provisional attendance found to confirm');
      } else {
        _logger.error('Failed to confirm: ${response.statusCode}');
      }

    } catch (e, stackTrace) {
      _logger.error('Confirmation failed', e, stackTrace);
    }
  }

  void cancelConfirmation() {
    _confirmationTimer?.cancel();
    _logger.debug('Confirmation timer cancelled');
  }
}
```

### Call it after successful check-in:

```dart
// After successful check-in
if (response.statusCode == 201) {
  final confirmationService = AttendanceConfirmationService();
  confirmationService.scheduleConfirmation(studentId, classId);
}
```

---

## ✅ Priority 7: RSSI Streaming (for Co-Location)

### Create `lib/core/services/rssi_stream_service.dart`

```dart
import 'dart:async';
import '../constants/app_constants.dart';
import 'http_service.dart';
import 'logger_service.dart';
import 'storage_service.dart';

class RSSIStreamService {
  static final RSSIStreamService _instance = RSSIStreamService._internal();
  factory RSSIStreamService() => _instance;
  RSSIStreamService._internal();

  final HttpService _httpService = HttpService();
  final LoggerService _logger = LoggerService();
  
  final List<Map<String, dynamic>> _rssiBuffer = [];
  Timer? _captureTimer;
  Timer? _streamTimer;
  bool _isStreaming = false;

  /// Start RSSI streaming for co-location detection
  void startStreaming(String studentId, String classId, int currentRSSI) {
    if (_isStreaming) {
      _logger.debug('RSSI streaming already active');
      return;
    }

    _isStreaming = true;
    _rssiBuffer.clear();

    _logger.info('📡 Starting RSSI streaming for ${AppConstants.rssiStreamDuration.inMinutes} minutes');

    // Capture RSSI every 5 seconds
    _captureTimer = Timer.periodic(AppConstants.rssiCaptureInterval, (_) {
      _captureRSSI(currentRSSI);
    });

    // Stop after 15 minutes
    _streamTimer = Timer(AppConstants.rssiStreamDuration, () {
      _stopStreaming(studentId, classId);
    });

    // Also send batches every minute
    Timer.periodic(const Duration(minutes: 1), (_) {
      if (_isStreaming) {
        _uploadBatch(studentId, classId);
      }
    });
  }

  void _captureRSSI(int rssi) {
    final reading = {
      'timestamp': DateTime.now().toIso8601String(),
      'rssi': rssi,
    };

    _rssiBuffer.add(reading);
    _logger.debug('📊 RSSI captured: $rssi (${_rssiBuffer.length} readings)');

    // Upload in batches
    if (_rssiBuffer.length >= AppConstants.rssiMaxBatchSize) {
      _uploadBatch(null, null);
    }
  }

  Future<void> _uploadBatch(String? studentId, String? classId) async {
    if (_rssiBuffer.isEmpty) return;

    try {
      final batch = List<Map<String, dynamic>>.from(_rssiBuffer);
      _rssiBuffer.clear();

      if (studentId != null && classId != null) {
        final response = await _httpService.streamRSSIData(
          studentId: studentId,
          classId: classId,
          rssiData: batch,
        );

        if (response.statusCode == 200) {
          _logger.info('📤 Uploaded ${batch.length} RSSI readings');
        }
      }
    } catch (e, stackTrace) {
      _logger.error('Failed to upload RSSI batch', e, stackTrace);
    }
  }

  Future<void> _stopStreaming(String studentId, String classId) async {
    _captureTimer?.cancel();
    _streamTimer?.cancel();
    
    // Upload remaining data
    await _uploadBatch(studentId, classId);
    
    _isStreaming = false;
    _logger.info('📡 RSSI streaming completed');
  }

  void cancelStreaming() {
    _captureTimer?.cancel();
    _streamTimer?.cancel();
    _rssiBuffer.clear();
    _isStreaming = false;
  }
}
```

### Start streaming after check-in:

```dart
// After successful check-in
if (response.statusCode == 201) {
  final rssiStreamService = RSSIStreamService();
  rssiStreamService.startStreaming(studentId, classId, beacon.rssi);
}
```

---

## ✅ Summary of Changes

### New Files to Create:
1. ✅ `lib/core/services/device_id_service.dart`
2. ✅ `lib/core/services/attendance_confirmation_service.dart`
3. ✅ `lib/core/services/rssi_stream_service.dart`

### Files to Modify:
1. ✅ `pubspec.yaml` - Add 3 new packages
2. ✅ `lib/core/services/http_service.dart` - Add device ID & new methods
3. ✅ `lib/core/constants/app_constants.dart` - Add new constants
4. ✅ Attendance check-in logic - Add confirmation & streaming calls

### Minimal Changes:
- ✅ Backend is **backward compatible**
- ✅ Existing `/api/check-in` still works
- ✅ Just add `deviceId` and `rssi` fields
- ✅ Response includes `status` field now

---

## 🧪 Testing Steps

1. **Test Device ID Generation**
   ```dart
   final deviceId = await DeviceIdService().getDeviceId();
   print('Device ID: $deviceId');
   ```

2. **Test Check-in with Device ID**
   - Check logs for device registration
   - Try checking in from another device (should fail)

3. **Test Two-Step Confirmation**
   - Check in
   - Wait 10 minutes
   - Check backend: status should change to 'confirmed'

4. **Test RSSI Streaming**
   - Check in
   - Observe logs for RSSI captures every 5 seconds
   - After 15 minutes, check backend for stream data

---

## 🎯 Next Actions

1. ✅ Add packages to `pubspec.yaml`
2. ✅ Create device ID service
3. ✅ Update HTTP service
4. ✅ Add confirmation service
5. ✅ Add RSSI streaming service
6. ✅ Test thoroughly!

Then you'll be ready for the Python analysis script! 🚀
