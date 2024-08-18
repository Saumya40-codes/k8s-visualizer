import React, { useState } from 'react';
import { Namespace } from '../lib/types/namespaces';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import './ClusterGraph.css';

interface ClusterGraphProps {
  namespaces: Namespace[];
}

const ClusterGraph: React.FC<ClusterGraphProps> = ({ namespaces }) => {
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleCardClick = (item: any) => {
    setSelectedItem(item);
  };

  const handleClose = () => {
    setSelectedItem(null);
  };

  return (
    <div>
      <Typography variant="h4" align="center" gutterBottom>
        Kubernetes Cluster Overview
      </Typography>
      <Grid container spacing={3}>
        {namespaces.map((namespace) => (
          <Grid item xs={12} sm={6} md={4} key={namespace.unique_id}>
            <Card onClick={() => handleCardClick(namespace)}>
              <CardHeader title={namespace.name} subheader="Namespace" />
              <CardContent>
                <Typography variant="body2" color="textSecondary">
                  Created At: {new Date(namespace.created_at).toLocaleString()}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Pods: {namespace.pods?.length || 0}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Deployments: {namespace.deployments?.length || 0}
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Services: {namespace.services?.length || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {selectedItem && (
        <Dialog open={Boolean(selectedItem)} onClose={handleClose}>
          <DialogTitle>{selectedItem.name}</DialogTitle>
          <DialogContent>
            <Typography variant="h6">Namespace: {selectedItem.name}</Typography>
            <Typography>Created At: {new Date(selectedItem.created_at).toLocaleString()}</Typography>

            {selectedItem.pods && (
              <div>
                <Typography variant="h6">Pods</Typography>
                {selectedItem.pods.map((pod: any) => (
                  <Typography key={pod.unique_id}>
                    {pod.name} (Status: {pod.status}, IP: {pod.ip})
                  </Typography>
                ))}
              </div>
            )}

            {selectedItem.deployments && (
              <div>
                <Typography variant="h6">Deployments</Typography>
                {selectedItem.deployments.map((deployment: any) => (
                  <Typography key={deployment.unique_id}>
                    {deployment.name} (Status: {deployment.status})
                  </Typography>
                ))}
              </div>
            )}

            {selectedItem.services && (
              <div>
                <Typography variant="h6">Services</Typography>
                {selectedItem.services.map((service: any) => (
                  <Typography key={service.unique_id}>
                    {service.name} (Type: {service.type})
                  </Typography>
                ))}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
};

export default ClusterGraph;

