import datetime
import random
import string
import time
import threading
from flask import Flask, request, jsonify, session, render_template, redirect
import database
import init_db

app = Flask(__name__)
app.secret_key = 'pulse_hms_secret_key_change_me_in_production'

# --- Helpers ---
def generate_id(prefix):
    return prefix + '-' + ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    return [dict(row) for row in rows]

# --- Background Reminder Engine ---
def check_due_reminders():
    while True:
        try:
            conn = database.get_db()
            cursor = conn.cursor()
            
            # Fetch notification preferences and lead time
            cursor.execute("SELECT key, value FROM settings")
            settings = {row['key']: row['value'] for row in cursor.fetchall()}
            email_pref = settings.get('email', 'true') == 'true'
            sms_pref = settings.get('sms', 'true') == 'true'
            lead_mins = int(settings.get('leadMinutes', '60'))
            
            # Fetch upcoming appointments that haven't been notified
            now = datetime.datetime.now()
            cursor.execute("SELECT * FROM appointments WHERE status = 'upcoming' AND notified = 0")
            appts = cursor.fetchall()
            
            changed = False
            for a in appts:
                # Calculate minutes remaining
                appt_dt_str = f"{a['date']} {a['time']}"
                try:
                    appt_dt = datetime.datetime.strptime(appt_dt_str, "%Y-%m-%d %H:%M")
                except ValueError:
                    continue
                
                mins_away = (appt_dt - now).total_seconds() / 60.0
                if 0 <= mins_away <= lead_mins:
                    msg = f"Reminder: appointment with {a['doctor_name']} on {a['date']} at {a['time']}."
                    # Log Email Notification
                    if email_pref and a['contact_email']:
                        notif_id = generate_id('NT')
                        cursor.execute("""
                            INSERT INTO notifications (id, at, channel, patient_name, target, message)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (notif_id, int(time.time()*1000), 'email', a['patient_name'], a['contact_email'], msg))
                    # Log SMS Notification
                    if sms_pref and a['contact_phone']:
                        notif_id = generate_id('NT')
                        cursor.execute("""
                            INSERT INTO notifications (id, at, channel, patient_name, target, message)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (notif_id, int(time.time()*1000), 'sms', a['patient_name'], a['contact_phone'], msg))
                    
                    # Mark appointment notified
                    cursor.execute("UPDATE appointments SET notified = 1 WHERE id = ?", (a['id'],))
                    changed = True
                    
            if changed:
                conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error in background reminder engine: {e}")
            
        time.sleep(30) # Run check every 30 seconds

# Start background thread
threading.Thread(target=check_due_reminders, daemon=True).start()


# --- Frontend Routes ---
@app.route('/')
def index():
    return render_template('index.html')


# --- API Routes ---

# 1. AUTH
@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    password = data.get('password') or ''
    
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, password))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        session['name'] = user['name']
        session['role'] = user['role']
        return jsonify({
            "ok": True,
            "user": {
                "username": user['username'],
                "name": user['name'],
                "role": user['role']
            }
        })
    else:
        return jsonify({"ok": False, "message": "Invalid username or password."}), 401

@app.route('/api/auth/session', methods=['GET'])
def api_session():
    if 'user_id' in session:
        return jsonify({
            "logged_in": True,
            "user": {
                "username": session['username'],
                "name": session['name'],
                "role": session['role']
            }
        })
    return jsonify({"logged_in": False})

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({"ok": True})


# 2. DASHBOARD STATS
@app.route('/api/dashboard/stats', methods=['GET'])
def api_dashboard_stats():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
        
    conn = database.get_db()
    cursor = conn.cursor()
    
    # Total Patients
    cursor.execute("SELECT COUNT(*) FROM patients")
    total_patients = cursor.fetchone()[0]
    
    # Admitted Patients
    cursor.execute("SELECT COUNT(*) FROM patients WHERE status = 'admitted'")
    admitted_patients = cursor.fetchone()[0]
    
    # Total Doctors
    cursor.execute("SELECT COUNT(*) FROM doctors")
    total_doctors = cursor.fetchone()[0]
    
    # Available Doctors
    cursor.execute("SELECT COUNT(*) FROM doctors WHERE status = 'available'")
    available_doctors = cursor.fetchone()[0]
    
    # Today's appointments count
    today_iso = datetime.date.today().isoformat()
    cursor.execute("SELECT COUNT(*) FROM appointments WHERE date = ?", (today_iso,))
    todays_appts_count = cursor.fetchone()[0]
    
    # Total upcoming appointments count
    cursor.execute("SELECT COUNT(*) FROM appointments WHERE status = 'upcoming'")
    upcoming_appts_count = cursor.fetchone()[0]
    
    # Revenue Collected (Paid Bills)
    cursor.execute("SELECT SUM(amount) FROM billing WHERE status = 'paid'")
    revenue_val = cursor.fetchone()[0] or 0.0
    
    # Unpaid Invoices count
    cursor.execute("SELECT COUNT(*) FROM billing WHERE status = 'unpaid'")
    unpaid_bills_count = cursor.fetchone()[0]
    
    # Today's schedule
    cursor.execute("SELECT * FROM appointments WHERE date = ? ORDER BY time ASC", (today_iso,))
    todays_appts = rows_to_list(cursor.fetchall())
    
    # Recent Patients (last 5 added)
    cursor.execute("SELECT * FROM patients ORDER BY rowid DESC LIMIT 5")
    recent_patients = rows_to_list(cursor.fetchall())
    
    # Pharmacy Alerts (Low stock)
    cursor.execute("SELECT * FROM pharmacy WHERE stock <= reorder")
    low_stock = rows_to_list(cursor.fetchall())
    
    # Weekly Graph Trend (Last 7 Days)
    week_days = []
    for i in range(6, -1, -1):
        d = datetime.date.today() - datetime.timedelta(days=i)
        week_days.append(d)
        
    weekly_labels = []
    weekly_data = []
    for wd in week_days:
        cursor.execute("SELECT COUNT(*) FROM appointments WHERE date = ?", (wd.isoformat(),))
        count = cursor.fetchone()[0]
        weekly_labels.append(wd.strftime("%a"))
        weekly_data.append(count)
        
    conn.close()
    
    return jsonify({
        "stats": {
            "totalPatients": total_patients,
            "admittedPatients": admitted_patients,
            "totalDoctors": total_doctors,
            "availableDoctors": available_doctors,
            "todaysApptsCount": todays_appts_count,
            "upcomingApptsCount": upcoming_appts_count,
            "revenue": revenue_val,
            "unpaidBillsCount": unpaid_bills_count
        },
        "todaysAppts": todays_appts,
        "recentPatients": recent_patients,
        "lowStock": low_stock,
        "weeklyTrend": {
            "labels": weekly_labels,
            "values": weekly_data
        }
    })


# 3. PATIENTS
@app.route('/api/patients', methods=['GET'])
def api_get_patients():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    q = request.args.get('q', '').strip()
    conn = database.get_db()
    cursor = conn.cursor()
    if q:
        cursor.execute("SELECT * FROM patients WHERE name LIKE ? ORDER BY name ASC", (f"%{q}%",))
    else:
        cursor.execute("SELECT * FROM patients ORDER BY name ASC")
    patients = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(patients)

@app.route('/api/patients', methods=['POST'])
def api_create_patient():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"message": "Name is required"}), 400
        
    patient_id = generate_id('PT')
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO patients (id, name, age, gender, phone, email, condition, status, blood)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, name, int(data.get('age', 0)), data.get('gender', 'Other'), 
          data.get('phone', ''), data.get('email', ''), data.get('condition', ''), 
          data.get('status', 'outpatient'), data.get('blood', 'O+')))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": patient_id, "name": name})

@app.route('/api/patients/<id>', methods=['PUT'])
def api_update_patient(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"message": "Name is required"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE patients 
        SET name=?, age=?, gender=?, phone=?, email=?, condition=?, status=?, blood=?
        WHERE id=?
    """, (name, int(data.get('age', 0)), data.get('gender', 'Other'), 
          data.get('phone', ''), data.get('email', ''), data.get('condition', ''), 
          data.get('status', 'outpatient'), data.get('blood', 'O+'), id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/patients/<id>', methods=['DELETE'])
def api_delete_patient(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM patients WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# 4. DOCTORS
@app.route('/api/doctors', methods=['GET'])
def api_get_doctors():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    q = request.args.get('q', '').strip()
    conn = database.get_db()
    cursor = conn.cursor()
    if q:
        cursor.execute("SELECT * FROM doctors WHERE name LIKE ? OR dept LIKE ? ORDER BY name ASC", (f"%{q}%", f"%{q}%"))
    else:
        cursor.execute("SELECT * FROM doctors ORDER BY name ASC")
    docs = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(docs)

@app.route('/api/doctors', methods=['POST'])
def api_create_doctor():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    dept = (data.get('dept') or '').strip()
    if not name or not dept:
        return jsonify({"message": "Name and Department are required"}), 400
        
    doc_id = generate_id('DOC')
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO doctors (id, name, dept, phone, email, status, patients)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (doc_id, name, dept, data.get('phone', ''), data.get('email', ''), 
          data.get('status', 'available'), int(data.get('patients', 0))))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": doc_id, "name": name})

@app.route('/api/doctors/<id>', methods=['PUT'])
def api_update_doctor(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    dept = (data.get('dept') or '').strip()
    if not name or not dept:
        return jsonify({"message": "Name and Department are required"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE doctors 
        SET name=?, dept=?, status=?, phone=?, email=?, patients=?
        WHERE id=?
    """, (name, dept, data.get('status', 'available'), data.get('phone', ''), 
          data.get('email', ''), int(data.get('patients', 0)), id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/doctors/<id>', methods=['DELETE'])
def api_delete_doctor(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM doctors WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# 5. APPOINTMENTS
@app.route('/api/appointments', methods=['GET'])
def api_get_appointments():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    filt = request.args.get('filter', 'all').strip()
    conn = database.get_db()
    cursor = conn.cursor()
    if filt == 'all':
        cursor.execute("SELECT * FROM appointments ORDER BY date ASC, time ASC")
    else:
        cursor.execute("SELECT * FROM appointments WHERE status = ? ORDER BY date ASC, time ASC", (filt,))
    appts = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(appts)

@app.route('/api/appointments', methods=['POST'])
def api_create_appointment():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    patient_id = data.get('patient_id')
    doctor_id = data.get('doctor_id')
    date_val = data.get('date')
    time_val = data.get('time')
    reason = data.get('reason') or 'General consultation'
    status_val = data.get('status') or 'upcoming'
    
    if not patient_id or not doctor_id or not date_val or not time_val:
        return jsonify({"message": "All fields are required"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    
    # Fetch details
    cursor.execute("SELECT name, email, phone FROM patients WHERE id = ?", (patient_id,))
    pt = cursor.fetchone()
    cursor.execute("SELECT name FROM doctors WHERE id = ?", (doctor_id,))
    doc = cursor.fetchone()
    
    if not pt or not doc:
        conn.close()
        return jsonify({"message": "Invalid patient or doctor ID"}), 404
        
    appt_id = generate_id('AP')
    cursor.execute("""
        INSERT INTO appointments 
        (id, patient_id, patient_name, doctor_id, doctor_name, date, time, reason, status, contact_email, contact_phone, notified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    """, (appt_id, patient_id, pt['name'], doctor_id, doc['name'], date_val, time_val, reason, status_val, pt['email'], pt['phone']))
    
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": appt_id, "patientName": pt['name']})

@app.route('/api/appointments/<id>', methods=['PUT'])
def api_update_appointment(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    patient_id = data.get('patient_id')
    doctor_id = data.get('doctor_id')
    date_val = data.get('date')
    time_val = data.get('time')
    reason = data.get('reason') or 'General consultation'
    status_val = data.get('status') or 'upcoming'
    
    if not patient_id or not doctor_id or not date_val or not time_val:
        return jsonify({"message": "All fields are required"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    
    # Fetch details
    cursor.execute("SELECT name, email, phone FROM patients WHERE id = ?", (patient_id,))
    pt = cursor.fetchone()
    cursor.execute("SELECT name FROM doctors WHERE id = ?", (doctor_id,))
    doc = cursor.fetchone()
    
    if not pt or not doc:
        conn.close()
        return jsonify({"message": "Invalid patient or doctor ID"}), 404
        
    cursor.execute("""
        UPDATE appointments 
        SET patient_id=?, patient_name=?, doctor_id=?, doctor_name=?, date=?, time=?, reason=?, status=?, contact_email=?, contact_phone=?
        WHERE id=?
    """, (patient_id, pt['name'], doctor_id, doc['name'], date_val, time_val, reason, status_val, pt['email'], pt['phone'], id))
    
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/appointments/<id>', methods=['DELETE'])
def api_delete_appointment(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM appointments WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/appointments/<id>/reminder', methods=['POST'])
def api_send_reminder(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM appointments WHERE id = ?", (id,))
    appt = cursor.fetchone()
    
    if not appt:
        conn.close()
        return jsonify({"message": "Appointment not found"}), 404
        
    # Get user settings
    cursor.execute("SELECT key, value FROM settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    email_pref = settings.get('email', 'true') == 'true'
    sms_pref = settings.get('sms', 'true') == 'true'
    
    msg = f"Reminder: appointment with {appt['doctor_name']} on {appt['date']} at {appt['time']}."
    
    # Save notifications
    if email_pref and appt['contact_email']:
        cursor.execute("""
            INSERT INTO notifications (id, at, channel, patient_name, target, message)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (generate_id('NT'), int(time.time()*1000), 'email', appt['patient_name'], appt['contact_email'], msg))
    if sms_pref and appt['contact_phone']:
        cursor.execute("""
            INSERT INTO notifications (id, at, channel, patient_name, target, message)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (generate_id('NT'), int(time.time()*1000), 'sms', appt['patient_name'], appt['contact_phone'], msg))
        
    # Update appointment notified state
    cursor.execute("UPDATE appointments SET notified = 1 WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    
    return jsonify({"ok": True})


# 6. BILLING
@app.route('/api/billing', methods=['GET'])
def api_get_billing():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    filt = request.args.get('filter', 'all').strip()
    conn = database.get_db()
    cursor = conn.cursor()
    if filt == 'all':
        cursor.execute("SELECT * FROM billing ORDER BY date DESC")
    else:
        cursor.execute("SELECT * FROM billing WHERE status = ? ORDER BY date DESC", (filt,))
    bills = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(bills)

@app.route('/api/billing', methods=['POST'])
def api_create_billing():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    patient_id = data.get('patient_id')
    items = (data.get('items') or '').strip()
    amount = float(data.get('amount') or 0)
    
    if not patient_id or not items or amount <= 0:
        return jsonify({"message": "All fields are required and amount must be positive"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM patients WHERE id = ?", (patient_id,))
    pt = cursor.fetchone()
    if not pt:
        conn.close()
        return jsonify({"message": "Invalid patient ID"}), 404
        
    inv_id = generate_id('INV')
    today_iso = datetime.date.today().isoformat()
    cursor.execute("""
        INSERT INTO billing (id, patient_id, patient_name, items, amount, status, date)
        VALUES (?, ?, ?, ?, ?, 'unpaid', ?)
    """, (inv_id, patient_id, pt['name'], items, amount, today_iso))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": inv_id, "patientName": pt['name'], "amount": amount})

@app.route('/api/billing/<id>/pay', methods=['PUT'])
def api_pay_billing(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE billing SET status = 'paid' WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/billing/<id>', methods=['DELETE'])
def api_delete_billing(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM billing WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# 7. PHARMACY
@app.route('/api/pharmacy', methods=['GET'])
def api_get_pharmacy():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    q = request.args.get('q', '').strip()
    conn = database.get_db()
    cursor = conn.cursor()
    if q:
        cursor.execute("SELECT * FROM pharmacy WHERE name LIKE ? ORDER BY name ASC", (f"%{q}%",))
    else:
        cursor.execute("SELECT * FROM pharmacy ORDER BY name ASC")
    meds = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(meds)

@app.route('/api/pharmacy', methods=['POST'])
def api_create_pharmacy():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    category = (data.get('category') or '').strip()
    if not name or not category:
        return jsonify({"message": "Name and Category are required"}), 400
        
    med_id = generate_id('MED')
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO pharmacy (id, name, category, stock, reorder, price, expiry)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (med_id, name, category, int(data.get('stock', 0)), int(data.get('reorder', 10)), 
          float(data.get('price', 0.0)), data.get('expiry', datetime.date.today().isoformat())))
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "id": med_id, "name": name})

@app.route('/api/pharmacy/<id>', methods=['PUT'])
def api_update_pharmacy(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    category = (data.get('category') or '').strip()
    if not name or not category:
        return jsonify({"message": "Name and Category are required"}), 400
        
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE pharmacy 
        SET name=?, category=?, stock=?, reorder=?, price=?, expiry=?
        WHERE id=?
    """, (name, category, int(data.get('stock', 0)), int(data.get('reorder', 10)), 
          float(data.get('price', 0.0)), data.get('expiry', datetime.date.today().isoformat()), id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/pharmacy/<id>', methods=['DELETE'])
def api_delete_pharmacy(id):
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM pharmacy WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# 8. NOTIFICATIONS
@app.route('/api/notifications', methods=['GET'])
def api_get_notifications():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM notifications ORDER BY at DESC")
    logs = rows_to_list(cursor.fetchall())
    conn.close()
    return jsonify(logs)


# 9. SETTINGS
@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    conn = database.get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    conn.close()
    
    # Cast variables properly
    return jsonify({
        "email": settings.get('email') == 'true',
        "sms": settings.get('sms') == 'true',
        "leadMinutes": int(settings.get('leadMinutes', 60))
    })

@app.route('/api/settings', methods=['POST'])
def api_update_settings():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    data = request.get_json() or {}
    
    conn = database.get_db()
    cursor = conn.cursor()
    for k, v in data.items():
        val_str = 'true' if v is True else ('false' if v is False else str(v))
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, val_str))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route('/api/settings/reset', methods=['POST'])
def api_reset_data():
    if 'user_id' not in session:
        return jsonify({"message": "Unauthorized"}), 401
    init_db.seed()
    return jsonify({"ok": True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
