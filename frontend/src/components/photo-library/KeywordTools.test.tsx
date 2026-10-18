import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {beforeEach,expect,it,vi} from 'vitest'
import {KeywordTools} from './KeywordTools'
import {keywordStatus,rebuildKeywords} from '@/api/metadataOverlay'
import {defaultFilters} from '@/utils/catalogFilters'
vi.mock('@/api/metadataOverlay',async original=>({...await original<typeof import('@/api/metadataOverlay')>(),keywordStatus:vi.fn(),rebuildKeywords:vi.fn()}))
const coverage={total:12,indexed:10,unknown:2,complete:false,source_freshness:'verified_at_index_only'}
beforeEach(()=>{vi.resetAllMocks();vi.mocked(keywordStatus).mockResolvedValue(coverage)})
it('shows unknown index membership, rebuilds bounded batches and applies keyword URL state',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}}),change=vi.fn()
 vi.mocked(rebuildKeywords).mockResolvedValueOnce({hasMore:true,nextAfterId:10,coverage,failed:0}).mockResolvedValueOnce({hasMore:false,nextAfterId:null,coverage:{...coverage,indexed:12,unknown:0,complete:true},failed:0})
 render(<QueryClientProvider client={client}><KeywordTools userId={1} orderId={7} value={defaultFilters()} onChange={change} disabled={false}/></QueryClientProvider>)
 await screen.findByText(/2 张尚未就绪/);fireEvent.click(screen.getByRole('button',{name:'重建关键词索引'}));await screen.findByText('关键词索引已就绪 12 / 12')
 expect(rebuildKeywords).toHaveBeenNthCalledWith(2,7,10,expect.any(AbortSignal))
 fireEvent.change(screen.getByLabelText('检索关键词'),{target:{value:'人像\nStudio'}});fireEvent.click(screen.getByRole('button',{name:'应用关键词筛选'}))
 await waitFor(()=>expect(change).toHaveBeenCalledWith({...defaultFilters(),keywords:['人像','Studio']}));client.clear()
})
