import React, { useState, useEffect } from 'react';
import { authenticationService, organizationService } from '@/_services';
import { CustomSelect } from './CustomSelect';
import { replaceWorkspaceIdParam } from '../../_helpers/utils';

export const OrganizationList = function () {
  const { current_organization_id } = authenticationService.currentOrgValue;
  const [organizationList, setOrganizationList] = useState([]);
  const [getOrgStatus, setGetOrgStatus] = useState('');

  useEffect(() => {
    getOrganizations();
  }, []);

  const getOrganizations = () => {
    setGetOrgStatus('loading');
    organizationService.getOrganizations().then(
      (data) => {
        setOrganizationList(data.organizations);
        setGetOrgStatus('success');
      },
      () => {
        setGetOrgStatus('failure');
      }
    );
  };

  const switchOrganization = (orgId) => {
    organizationService.switchOrganization(orgId).then(
      (data) => {
        const newPath = replaceWorkspaceIdParam(orgId, location.pathname);
        window.history.replaceState(null, null, newPath);
        authenticationService.updateCurrentUserDetails(data);
        window.location.reload();
      },
      () => {
        return (window.location.href = `login/${orgId}`);
      }
    );
  };

  const getAvatar = (organization) => {
    if (!organization) return;

    const orgName = organization.split(' ').filter((e) => e && !!e.trim());
    if (orgName.length > 1) {
      return `${orgName[0]?.[0]}${orgName[1]?.[0]}`;
    } else if (organization.length >= 2) {
      return `${organization[0]}${organization[1]}`;
    } else {
      return `${organization[0]}${organization[0]}`;
    }
  };

  const options = organizationList.map((org) => ({
    value: org.id,
    name: org.name,
    label: (
      <div className="row align-items-center">
        <div className="col organization-avatar">
          <span className="avatar avatar-sm bg-secondary-lt">{getAvatar(org.name)}</span>
        </div>
        <div className="col">
          <div className="org-name">{org.name}</div>
        </div>
      </div>
    ),
  }));

  return (
    <CustomSelect
      isLoading={getOrgStatus === 'loading'}
      options={options}
      value={current_organization_id}
      onChange={(id) => switchOrganization(id)}
    />
  );
};