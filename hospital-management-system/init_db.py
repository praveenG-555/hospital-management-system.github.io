import datetime
import database

def seed():
    # Initialize DB schema
    database.init_db()
    
    conn = database.get_db()
    cursor = conn.cursor()
    
    # 1. Clear existing data
    cursor.execute("DELETE FROM users")
    cursor.execute("DELETE FROM patients")
    cursor.execute("DELETE FROM doctors")
    cursor.execute("DELETE FROM appointments")
    cursor.execute("DELETE FROM billing")
    cursor.execute("DELETE FROM pharmacy")
    cursor.execute("DELETE FROM notifications")
    cursor.execute("DELETE FROM settings")
    
    # 2. Insert Users
    users_data = [
        ('USR-ADMIN', 'admin', 'admin123', 'Ava Reyes', 'administrator'),
        ('USR-DOCTOR', 'doctor', 'doctor123', 'Dr. Michael Chen', 'doctor'),
        ('USR-RECEPTION', 'reception', 'reception123', 'Priya Nair', 'receptionist'),
        ('USR-PHARMACIST', 'pharmacist', 'pharmacy123', 'Leo Martins', 'pharmacist')
    ]
    cursor.executemany("INSERT INTO users (id, username, password, name, role) VALUES (?, ?, ?, ?, ?)", users_data)
    
    # 3. Insert Doctors
    # Use deterministic keys to link correctly
    doc_ids = ['DOC-1', 'DOC-2', 'DOC-3', 'DOC-4', 'DOC-5']
    doctors_data = [
        (doc_ids[0], 'Dr. Michael Chen', 'Cardiology', '555-0142', 'm.chen@pulsehms.demo', 'available', 38),
        (doc_ids[1], 'Dr. Sarah Kim', 'Pediatrics', '555-0198', 's.kim@pulsehms.demo', 'available', 52),
        (doc_ids[2], 'Dr. Omar Farouk', 'Orthopedics', '555-0176', 'o.farouk@pulsehms.demo', 'on-leave', 21),
        (doc_ids[3], 'Dr. Elena Petrova', 'Dermatology', '555-0159', 'e.petrova@pulsehms.demo', 'available', 29),
        (doc_ids[4], 'Dr. James Okafor', 'Neurology', '555-0133', 'j.okafor@pulsehms.demo', 'in-surgery', 17)
    ]
    cursor.executemany("INSERT INTO doctors (id, name, dept, phone, email, status, patients) VALUES (?, ?, ?, ?, ?, ?, ?)", doctors_data)
    
    # 4. Insert Patients
    pt_ids = ['PT-1', 'PT-2', 'PT-3', 'PT-4', 'PT-5']
    patients_data = [
        (pt_ids[0], 'Grace Thompson', 34, 'Female', '555-3321', 'grace.t@mail.demo', 'Hypertension', 'admitted', 'O+'),
        (pt_ids[1], 'David Alvarez', 58, 'Male', '555-8890', 'd.alvarez@mail.demo', 'Post-op Recovery', 'admitted', 'A-'),
        (pt_ids[2], 'Mei Lin', 27, 'Female', '555-2245', 'mei.lin@mail.demo', 'Routine Checkup', 'outpatient', 'B+'),
        (pt_ids[3], 'Samuel Osei', 45, 'Male', '555-7712', 'samuel.o@mail.demo', 'Diabetes Type 2', 'outpatient', 'AB+'),
        (pt_ids[4], 'Isabella Moreau', 8, 'Female', '555-4456', 'parent.moreau@mail.demo', 'Seasonal Flu', 'discharged', 'O-')
    ]
    cursor.executemany("INSERT INTO patients (id, name, age, gender, phone, email, condition, status, blood) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", patients_data)
    
    # 5. Insert Appointments
    today = datetime.date.today().isoformat()
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    
    # Let's define appointment times relative to now
    time1 = (datetime.datetime.now() + datetime.timedelta(minutes=5)).strftime("%H:%M")
    time2 = (datetime.datetime.now() + datetime.timedelta(minutes=75)).strftime("%H:%M")
    time3 = (datetime.datetime.now() + datetime.timedelta(hours=24, minutes=30)).strftime("%H:%M")
    
    appointments_data = [
        ('AP-1', pt_ids[0], 'Grace Thompson', doc_ids[0], 'Dr. Michael Chen', today, time1, 'Follow-up consult', 'upcoming', 'grace.t@mail.demo', '555-3321', 0),
        ('AP-2', pt_ids[2], 'Mei Lin', doc_ids[1], 'Dr. Sarah Kim', today, time2, 'Annual physical', 'upcoming', 'mei.lin@mail.demo', '555-2245', 0),
        ('AP-3', pt_ids[3], 'Samuel Osei', doc_ids[0], 'Dr. Michael Chen', tomorrow, time3, 'Blood sugar review', 'upcoming', 'samuel.o@mail.demo', '555-7712', 0),
        ('AP-4', pt_ids[4], 'Isabella Moreau', doc_ids[1], 'Dr. Sarah Kim', '2026-07-10', '11:00', 'Flu follow-up', 'completed', 'parent.moreau@mail.demo', '555-4456', 1)
    ]
    cursor.executemany("""
        INSERT INTO appointments 
        (id, patient_id, patient_name, doctor_id, doctor_name, date, time, reason, status, contact_email, contact_phone, notified) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, appointments_data)
    
    # 6. Insert Billing
    billing_data = [
        ('INV-1', pt_ids[0], 'Grace Thompson', 'Consultation, ECG, Medication', 340.00, 'unpaid', today),
        ('INV-2', pt_ids[1], 'David Alvarez', 'Surgery Fee, Room Charges (3 nights)', 4820.50, 'paid', '2026-07-08'),
        ('INV-3', pt_ids[2], 'Mei Lin', 'General Checkup, Lab Tests', 125.00, 'paid', '2026-07-05'),
        ('INV-4', pt_ids[3], 'Samuel Osei', 'Consultation, Insulin Prescription', 210.75, 'unpaid', today)
    ]
    cursor.executemany("INSERT INTO billing (id, patient_id, patient_name, items, amount, status, date) VALUES (?, ?, ?, ?, ?, ?, ?)", billing_data)
    
    # 7. Insert Pharmacy
    pharmacy_data = [
        ('MED-1', 'Amoxicillin 500mg', 'Antibiotic', 210, 50, 0.45, '2027-02-01'),
        ('MED-2', 'Paracetamol 650mg', 'Analgesic', 18, 60, 0.12, '2026-11-15'),
        ('MED-3', 'Metformin 500mg', 'Antidiabetic', 95, 40, 0.30, '2027-05-20'),
        ('MED-4', 'Insulin Glargine', 'Antidiabetic', 12, 20, 24.90, '2026-09-30'),
        ('MED-5', 'Cetirizine 10mg', 'Antihistamine', 140, 30, 0.20, '2027-01-10')
    ]
    cursor.executemany("INSERT INTO pharmacy (id, name, category, stock, reorder, price, expiry) VALUES (?, ?, ?, ?, ?, ?, ?)", pharmacy_data)
    
    # 8. Insert Settings
    settings_data = [
        ('email', 'true'),
        ('sms', 'true'),
        ('leadMinutes', '60')
    ]
    cursor.executemany("INSERT INTO settings (key, value) VALUES (?, ?)", settings_data)
    
    conn.commit()
    conn.close()
    print("Database seeded successfully.")

if __name__ == '__main__':
    seed()
