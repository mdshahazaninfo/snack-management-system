import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/utils'
import { Card, Empty, ErrorText } from '../components/Ui'

type Item = { id: string; name: string; category: string; sku: string; selling_price: number; unit_cost: number; active: boolean }
export function MenuPage() {
  const [items, setItems] = useState<Item[]>([]); const [error, setError] = useState<string | null>(null)
  const load = async () => { const { data, error } = await supabase.from('menu_items').select('*').order('name'); if (error) setError(error.message); else setItems(data || []) }
  useEffect(() => { load() }, [])
  const add = async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); const { error } = await supabase.from('menu_items').insert({ name: f.get('name'), category: f.get('category'), sku: f.get('sku'), selling_price: Number(f.get('price')), unit_cost: Number(f.get('cost')) }); if (error) setError(error.message); else { e.currentTarget.reset(); load() } }
  return <><div className="page-title"><div><h1>Food Menu</h1><p>Products, SKU/barcodes and price history</p></div></div><ErrorText error={error}/><Card title="Add menu item"><form className="form-grid" onSubmit={add}><label>Name<input name="name" required/></label><label>Category<input name="category" required/></label><label>SKU / barcode<input name="sku" required/></label><label>Selling price<input name="price" type="number" step="0.01" min="0" required/></label><label>Unit cost<input name="cost" type="number" step="0.01" min="0" required/></label><button>Add item</button></form></Card>
    <Card title="Menu">{items.length ? <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Price</th><th>Cost</th><th>Status</th></tr></thead><tbody>{items.map(i => <tr key={i.id}><td>{i.sku}</td><td>{i.name}</td><td>{i.category}</td><td>{money(i.selling_price)}</td><td>{money(i.unit_cost)}</td><td>{i.active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div> : <Empty/>}</Card></>
}
