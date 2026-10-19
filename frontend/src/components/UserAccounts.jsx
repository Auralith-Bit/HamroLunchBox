import { useState } from 'react';
import { Btn, Card, Table } from './ui';

const api=async(path,options={})=>{const r=await fetch('/api'+path,{credentials:'include',headers:{'Content-Type':'application/json'},...options});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Request failed');return b};
export default function UserAccounts({accounts,onChange}) {
  const [form,setForm]=useState({username:'',name:'',role:'reception',password:''});
  const [passwordForm,setPasswordForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''});
  const [passwordMessage,setPasswordMessage]=useState('');
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const field='w-full border border-cream-300 bg-white rounded-lg px-3 py-2';
  const refresh=async()=>onChange((await api('/auth/users')).users);
  const create=async e=>{e.preventDefault();setError('');setBusy(true);try{await api('/auth/users',{method:'POST',body:JSON.stringify(form)});setForm({username:'',name:'',role:'reception',password:''});await refresh()}catch(err){setError(err.message)}finally{setBusy(false)}};
  const toggle=async user=>{setError('');try{await api(`/auth/users/${user.id}`,{method:'PATCH',body:JSON.stringify({active:!user.active})});await refresh()}catch(err){setError(err.message)}};
  const changePassword=async e=>{e.preventDefault();setPasswordMessage('');if(passwordForm.newPassword!==passwordForm.confirmPassword){setPasswordMessage('The new passwords do not match.');return}try{await api('/auth/password',{method:'POST',body:JSON.stringify({currentPassword:passwordForm.currentPassword,newPassword:passwordForm.newPassword})});setPasswordForm({currentPassword:'',newPassword:'',confirmPassword:''});setPasswordMessage('Password updated. Use your new password next time you sign in.')}catch(err){setPasswordMessage(err.message)}};
  return <div className="grid gap-4">
    <Card title="Change your admin password"><p className="text-sm text-stone-600 mb-3">Choose a memorable passphrase of at least 12 characters, such as several words together.</p><form onSubmit={changePassword} className="grid sm:grid-cols-3 gap-3">
      <label className="text-sm">Current password<input type="password" className={field} autoComplete="current-password" value={passwordForm.currentPassword} onChange={e=>setPasswordForm({...passwordForm,currentPassword:e.target.value})} required/></label>
      <label className="text-sm">New passphrase<input type="password" className={field} minLength="12" autoComplete="new-password" value={passwordForm.newPassword} onChange={e=>setPasswordForm({...passwordForm,newPassword:e.target.value})} required/></label>
      <label className="text-sm">Confirm passphrase<input type="password" className={field} minLength="12" autoComplete="new-password" value={passwordForm.confirmPassword} onChange={e=>setPasswordForm({...passwordForm,confirmPassword:e.target.value})} required/></label>
      {passwordMessage&&<p role="status" className="sm:col-span-3 text-sm text-stone-700">{passwordMessage}</p>}<Btn className="sm:col-span-3" type="submit">Update password</Btn>
    </form></Card>
    <Card title="Create login account"><p className="text-sm text-stone-600 mb-3">Create a separate account for each administrator, receptionist, or delivery person. Passwords must be at least 12 characters.</p><form onSubmit={create} className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm">Username<input className={field} minLength="3" maxLength="64" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} required/></label>
      <label className="text-sm">Display name<input className={field} maxLength="120" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
      <label className="text-sm">Role<select className={field} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="reception">Reception</option><option value="delivery">Delivery</option><option value="admin">Admin</option></select></label>
      <label className="text-sm">Temporary password<input type="password" className={field} minLength="12" autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/></label>
      {error&&<p role="alert" className="sm:col-span-2 text-sm text-brand">{error}</p>}<Btn disabled={busy} className="sm:col-span-2" type="submit">{busy?'Creating…':'Create account'}</Btn>
    </form></Card>
    <Card title="Accounts"><Table head={['Name','Username','Role','Status','Action']}>{accounts.map(u=><tr key={u.id}><td className="font-semibold">{u.name}</td><td>{u.username}</td><td className="capitalize">{u.role}</td><td>{u.active?'Active':'Disabled'}</td><td><Btn c="bg-white border border-cream-300" onClick={()=>toggle(u)}>{u.active?'Disable':'Enable'}</Btn></td></tr>)}</Table></Card>
  </div>;
}
