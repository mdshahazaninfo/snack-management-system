import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/utils'
import { Card, Empty, ErrorText, SuccessText } from '../components/Ui'

type Item = { id:string; name:string; category:string; sku:string; selling_price:number; unit_cost:number; active:boolean }

export function MenuPage(){
  const[items,setItems]=useState<Item[]>([]),[error,setError]=useState<string|null>(null),[success,setSuccess]=useState<string|null>(null)
  const load=async()=>{const{data,error:loadError}=await supabase.from('menu_items').select('*').order('name');if(loadError)setError(loadError.message);else setItems((data||[]) as Item[])}
  useEffect(()=>{void load()},[])

  const add=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const{error:addError}=await supabase.from('menu_items').insert({name:f.get('name'),category:f.get('category'),sku:f.get('sku'),selling_price:Number(f.get('price')),unit_cost:Number(f.get('cost'))});if(addError)setError(addError.message);else{setSuccess('Menu item added.');form.reset();await load()}}
  const save=async(item:Item,patch:Partial<Item>)=>{const next={...item,...patch};const{error:updateError}=await supabase.rpc('admin_update_menu_item',{p_id:next.id,p_name:next.name,p_category:next.category,p_sku:next.sku,p_selling_price:Number(next.selling_price),p_unit_cost:Number(next.unit_cost),p_active:next.active});if(updateError)setError(updateError.message);else{setSuccess(`Updated ${next.name}.`);await load()}}
  const remove=async(item:Item)=>{if(!confirm(`Remove ${item.name}? Used items will be archived to preserve order history.`))return;const{data,error:removeError}=await supabase.rpc('admin_remove_menu_item',{p_id:item.id});if(removeError)setError(removeError.message);else{setSuccess(data==='archived'?'Item archived because order history exists.':'Item permanently deleted.');await load()}}

  return <><div className="page-title"><div><h1>Food Menu</h1><p>Products, SKU/barcodes and price history</p></div></div><ErrorText error={error}/><SuccessText text={success}/><Card title="Add menu item"><form className="form-grid" onSubmit={add}><label>Name<input name="name" required/></label><label>Category<input name="category" required/></label><label>SKU / barcode<input name="sku" required/></label><label>Selling price<input name="price" type="number" step="0.01" min="0" required/></label><label>Unit cost<input name="cost" type="number" step="0.01" min="0" required/></label><button>Add item</button></form></Card><Card title="Menu">{items.length?<div className="table-wrap"><table><thead><tr><th>SKU</th><th>Item</th><th>Category</th><th>Price</th><th>Cost</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(i=><MenuRow key={i.id} item={i} onSave={save} onRemove={remove}/>)}</tbody></table></div>:<Empty/>}</Card></>
}

function MenuRow({item,onSave,onRemove}:{item:Item;onSave:(item:Item,patch:Partial<Item>)=>Promise<void>;onRemove:(item:Item)=>Promise<void>}){
  const[name,setName]=useState(item.name),[category,setCategory]=useState(item.category),[sku,setSku]=useState(item.sku),[price,setPrice]=useState(String(item.selling_price)),[cost,setCost]=useState(String(item.unit_cost)),[active,setActive]=useState(item.active)
  return <tr><td><input value={sku} onChange={e=>setSku(e.target.value)}/></td><td><input value={name} onChange={e=>setName(e.target.value)}/></td><td><input value={category} onChange={e=>setCategory(e.target.value)}/></td><td><input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/><small>{money(price)}</small></td><td><input type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/><small>{money(cost)}</small></td><td><select value={active?'active':'inactive'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><div className="row-actions"><button className="tiny secondary" onClick={()=>void onSave(item,{name,category,sku,selling_price:Number(price),unit_cost:Number(cost),active})}>Save</button><button className="tiny danger-btn" onClick={()=>void onRemove(item)}>Delete</button></div></td></tr>
}
