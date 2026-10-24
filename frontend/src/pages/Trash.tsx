import { useDocumentTypes } from '../hooks';
import { DocumentsTable } from '../components/DocumentsTable';
import { PageIntro } from '../components/PageIntro';
import { TrashIcon } from '../components/Icons';

export function Trash() {
  const types = useDocumentTypes();
  return (
    <>
      <PageIntro icon={<TrashIcon />} title="Çöp Kutusu">
        Silinen evraklar burada tutulur; geri yükleyebilir veya kalıcı olarak silebilirsiniz
        (kalıcı silme geri alınamaz).
      </PageIntro>
      <div className="alert">
        Çöp kutusundaki evraklar sistemde durmaya devam ettiği için <strong>kotanızdan düşmeye
        devam eder</strong>; kalıcı olarak sildiğinizde kotanız iade edilir.
      </div>
      <DocumentsTable endpoint="/documents" documentTypes={types} mode="trash" />
    </>
  );
}
