const res = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@auditiq.in', password: 'Admin@123' }),
});
const text = await res.text();
console.log('status', res.status);
console.log(text.slice(0, 500));
