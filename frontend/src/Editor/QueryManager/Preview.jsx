import React, { useEffect } from 'react';
import { JSONTree } from 'react-json-tree';
import { Tab, ListGroup, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
const Preview = ({ previewPanelRef, previewLoading, queryPreviewData, theme, darkMode }) => {
  const { t } = useTranslation();
  const [key, setKey] = React.useState('raw');
  const [isJson, setIsJson] = React.useState(false);
  const tabs = ['Json', 'Raw'];
  useEffect(() => {
    if (typeof queryPreviewData === 'object') {
      setKey('json');
    } else {
      setKey('raw');
    }
    setIsJson(typeof queryPreviewData === 'object');
  }, [queryPreviewData]);
  const renderRawData = () => {
    if (queryPreviewData) {
      return isJson ? JSON.stringify(queryPreviewData).toString() : queryPreviewData.toString();
    }
    return '';
  };

  return (
    <div>
      <div className="preview-header border-bottom d-flex align-items-baseline" ref={previewPanelRef}>
        <div className="py-2" style={{ fontWeight: 600 }}>
          {t('editor.preview', 'Preview')}
        </div>
        <Tab.Container activeKey={key} onSelect={(k) => setKey(k)} defaultActiveKey="raw">
          <Row style={{ width: '100%' }}>
            <div className="keys">
              <ListGroup className={`query-preview-list-group ${darkMode ? 'dark' : ''}`} variant="flush">
                {tabs.map((tab) => (
                  <ListGroup.Item key={tab} eventKey={tab.toLowerCase()}>
                    <span>{tab}</span>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </div>
            {previewLoading && (
              <center>
                <div className="spinner-border text-azure mt-5" role="status"></div>
              </center>
            )}
            <div
              className="col mx-2 mb-2"
              style={{
                userSelect: 'text',
                backgroundColor: `${queryPreviewData ? 'transparent' : darkMode ? '#333C48' : '#ECEEF0'}`,
              }}
            >
              <Tab.Content style={{ minHeight: '46px', overflowWrap: 'anywhere' }}>
                <Tab.Pane eventKey="json" transition={false}>
                  <div className="mb-3 ">
                    {previewLoading === false && isJson && (
                      <div className="w-100">
                        <JSONTree theme={theme} data={queryPreviewData} invertTheme={!darkMode} collectionLimit={100} />
                      </div>
                    )}
                  </div>
                </Tab.Pane>
                <Tab.Pane eventKey="raw" transition={false}>
                  <div className={`mb-3 mt-2 raw-container `}>{renderRawData()}</div>
                </Tab.Pane>
              </Tab.Content>
            </div>
          </Row>
        </Tab.Container>
      </div>
    </div>
  );
};

export default Preview;
