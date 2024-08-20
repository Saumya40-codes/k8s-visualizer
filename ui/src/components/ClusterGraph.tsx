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
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@mui/material';
import { styled } from '@mui/system';
import DnsIcon from '@mui/icons-material/Dns';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import MemoryIcon from '@mui/icons-material/Memory';
import LockIcon from '@mui/icons-material/Lock';
import DescriptionIcon from '@mui/icons-material/Description';

interface ClusterGraphProps {
  namespaces: Namespace[];
}

const StyledCard = styled(Card)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'transform 0.3s, box-shadow 0.3s',
  background: 'linear-gradient(145deg, #1e2a4a 0%, #16213e 100%)',
  '&:hover': {
    transform: 'translateY(-5px)',
    boxShadow: '0 12px 20px -10px rgba(0,255,255,0.3)',
  },
}));

const StyledCardContent = styled(CardContent)({
  flexGrow: 1,
});

const IconTypography = styled(Typography)({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
});

const GlowingChip = styled(Chip)(({ theme }) => ({
  background: 'rgba(78, 204, 163, 0.2)',
  color: theme.palette.primary.main,
  border: `1px solid ${theme.palette.primary.main}`,
  boxShadow: '0 0 10px rgba(78, 204, 163, 0.5)',
}));

const ClusterGraph: React.FC<ClusterGraphProps> = ({ namespaces }) => {
  const [selectedItem, setSelectedItem] = useState<Namespace | null>(null);

  const handleCardClick = (item: Namespace) => {
    setSelectedItem(item);
  };

  const handleClose = () => {
    setSelectedItem(null);
  };

  const formatCreatedAt = (createdAt: string) => {
    return createdAt.split('T')[0];
  }

  return (
      <Box sx={{ padding: 3, minHeight: '100vh' }}>
        <Typography variant="h3" align="center" gutterBottom fontWeight="bold" color="primary" sx={{ mb: 4 }}>
          Kubernetes Cluster Overview
        </Typography>
        <Grid container spacing={3}>
          {namespaces.map((namespace) => (
            <Grid item xs={12} sm={6} md={4} key={namespace.unique_id}>
              <StyledCard onClick={() => handleCardClick(namespace)}>
                <CardHeader
                  title={namespace.name}
                  subheader="Namespace"
                  titleTypographyProps={{ variant: 'h6', fontWeight: 'bold', color: 'primary.main' }}
                  subheaderTypographyProps={{ color: 'secondary.main' }}
                />
                <StyledCardContent>
                  <IconTypography variant="body1" color="text.primary">
                    <DnsIcon fontSize="small" color="primary" /> Pods: {namespace.pods?.length || 0}
                  </IconTypography>
                  <IconTypography variant="body1" color="text.primary">
                    <StorageIcon fontSize="small" color="primary" /> Deployments: {namespace.deployments?.length || 0}
                  </IconTypography>
                  <IconTypography variant="body1" color="text.primary">
                    <SettingsEthernetIcon fontSize="small" color="primary" /> Services: {namespace.services?.length || 0}
                  </IconTypography>
                </StyledCardContent>
                <CardContent>
                  <GlowingChip
                    icon={<MemoryIcon />}
                    label={`Created: ${formatCreatedAt(namespace.created_at)}`}
                    size="small"
                  />
                </CardContent>
              </StyledCard>
            </Grid>
          ))}
        </Grid>
        {selectedItem && (
          <Dialog open={Boolean(selectedItem)} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ background: 'linear-gradient(145deg, #1e2a4a 0%, #16213e 100%)' }}>
              <Typography variant="h5" color="primary.main">{selectedItem.name}</Typography>
            </DialogTitle>
            <DialogContent dividers sx={{ background: '#16213e' }}>
              <Typography variant="subtitle1" gutterBottom color="secondary.main">
                Created: {formatCreatedAt(selectedItem.created_at)}
              </Typography>
              {selectedItem.pods && (
                <Box my={2}>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    Pods
                  </Typography>
                  <List>
                    {selectedItem.pods.map((pod: any) => (
                      <React.Fragment key={pod.unique_id}>
                        <ListItem>
                          <ListItemText
                            primary={<Typography color="text.primary">{pod.name}</Typography>}
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                Status: {pod.status} | IP: {pod.ip}
                              </Typography>
                            }
                          />
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
              {selectedItem.deployments && (
                <Box my={2}>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    Deployments
                  </Typography>
                  <List>
                    {selectedItem.deployments.map((deployment: any) => (
                      <React.Fragment key={deployment.unique_id}>
                        <ListItem>
                          <ListItemText
                            primary={<Typography color="text.primary">{deployment.name}</Typography>}
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                Status: {deployment.status}
                              </Typography>
                            }
                          />
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
              {selectedItem.services && (
                <Box my={2}>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    Services
                  </Typography>
                  <List>
                    {selectedItem.services.map((service: any) => (
                      <React.Fragment key={service.unique_id}>
                        <ListItem>
                          <ListItemText
                            primary={<Typography color="text.primary">{service.name}</Typography>}
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                Type: {service.type}
                              </Typography>
                            }
                          />
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
              {selectedItem.config_maps && (
                <Box my={2}>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    ConfigMaps <DescriptionIcon fontSize="small" />
                  </Typography>
                  <List>
                    {selectedItem.config_maps.map((configMap: any) => (
                      <React.Fragment key={configMap.name}>
                        <ListItem>
                          <ListItemText
                            primary={<Typography color="text.primary">{configMap.name}</Typography>}
                          />
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
              {selectedItem.secrets && (
                <Box my={2}>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    Secrets <LockIcon fontSize="small" />
                  </Typography>
                  <List>
                    {selectedItem.secrets.map((secret: any) => (
                      <React.Fragment key={secret.unique_id}>
                        <ListItem>
                          <ListItemText
                            primary={<Typography color="text.primary">{secret.name}</Typography>}
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                Type: {secret.type}
                              </Typography>
                            }
                          />
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    ))}
                  </List>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ background: '#16213e' }}>
              <Button onClick={handleClose} color="primary" variant="outlined">
                Close
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
  );
};

export default ClusterGraph;
